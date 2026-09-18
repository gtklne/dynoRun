/**
 * Independent, offline audit probes. Run from the repository root:
 *   node scripts/audit-grip-baseline.mjs
 * Writes docs/audits/grip-audit-results.json; exits 1 if a claim is refuted.
 * Refutations are deliberately NOT expectations of correct product behavior.
 * No sessions are uploaded and no product files are changed.
 */
import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

// Historical experiment: refuse to overwrite its evidence with different code.
const inventory = JSON.parse(readFileSync('docs/audits/grip-source-inventory.json', 'utf8'));
for (const f of inventory.files) {
  if (createHash('sha256').update(readFileSync(f.file)).digest('hex') !== f.sha256) {
    throw new Error('Historical audit requires source revision 638eb4b. Run scripts/audit-grip.mjs for the current regression suite; keep the baseline evidence unchanged.');
  }
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const results = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), checks: [], observations: {}, fixtures: [] };
const check = (id, claim, passed, evidence) => results.checks.push({ id, claim, status: passed ? 'supported' : 'refuted', evidence });
const f32 = (xs) => Float32Array.from(xs);
const filled = (n, value) => new Float32Array(n).fill(value);
const maxAbs = (xs) => Math.max(...Array.from(xs, Math.abs));
const q = (xs, p) => { const a = [...xs].sort((a, b) => a - b); return a[Math.floor((a.length - 1) * p)]; };

try {
  const modules = {};
  for (const name of ['channels', 'load', 'envelope', 'parse-racebox', 'settings', 'storage', 'analyze', 'corners', 'laps', 'align', 'compare', 'compare-stats', 'turn-cluster', 'project']) {
    modules[name] = await server.ssrLoadModule(`/src/analysis/grip/${name}.ts`);
  }
  const { computeChannels, resistanceG, GRAVITY, movAvg } = modules.channels;
  const { computeLoad, computeCombined, frontWeightFraction } = modules.load;
  const { computeEnvelope } = modules.envelope;
  const { parseRaceboxCsv } = modules['parse-racebox'];
  const { DEFAULT_GRIP_SETTINGS: settings, sanitizeGripSettings } = modules.settings;
  const { packGripData, unpackGripData, isStoredGripData } = modules.storage;
  const { analyzeGripSession } = modules.analyze;
  const { detectCorners, cornerStats } = modules.corners;
  const { buildLaps } = modules.laps;
  const { geoFrame, frameForLap, lapPath, distanceGrid, valueAtU, resampleByDistance } = modules.align;
  const { compareLaps } = modules.compare;
  const { sectorScores, equalBudgetEnvelope, compareSegments, dutyMetres, lapPace, turnPayoff } = modules['compare-stats'];
  const { clusterByAxisDistance } = modules['turn-cluster'];
  const { formatLapTime } = await server.ssrLoadModule('/src/ui/grip/format-lap.ts');
  const channels = (n = 300, hz = 25, speed = () => 30, lean = () => 0) => {
    const t = Array.from({ length: n }, (_, i) => i / hz);
    return { t, lat: t.map(() => 47), lon: t.map((s) => 8 + s * 0.0003), spd: t.map(speed), lean: t.map(lean), lap: t.map(() => 1), head: t.map(() => 90) };
  };
  const csv = (ch, metadata = []) => ['Track,Synthetic', ...metadata, 'Record,Time,Latitude,Longitude,Speed (m/s),Lap,Heading,LeanAngle (deg)', ...ch.t.map((t, i) => [i, new Date(Date.UTC(2026, 0, 1) + Math.round(t * 1000)).toISOString(), ch.lat[i], ch.lon[i], ch.spd[i], ch.lap[i], ch.head[i], ch.lean[i]].join(','))].join('\n');
  const env = (values, long = 0) => computeEnvelope({ spdS: filled(values.length, 30), comb: f32(values), theta: filled(values.length, 0), alongRaw: filled(values.length, long) }, settings);

  check('P01', 'Standard gravity conversion equals 9.80665 m/s²', GRAVITY === 9.80665, GRAVITY);
  const uniform = channels(400, 25, (t) => 20 + 2 * t, () => 45);
  const derived = computeChannels(uniform, 9);
  const linearError = maxAbs(Array.from(derived.alongRaw.slice(20, -20), (v) => v - 2 / 9.80665));
  check('P02', 'Uniform-sampled linear speed gives the analytical acceleration away from edges', linearError < 1e-5, { maxErrorG: linearError });
  check('P03', 'Ideal balanced 45° lean maps to 1 lateral g', Math.abs(derived.alat[100] - 1) < 1e-6, derived.alat[100]);
  check('P04', 'Combined channel is the Euclidean norm of its components', Math.abs(derived.comb[100] - Math.hypot(derived.along[100], derived.alat[100])) < 1e-6, derived.comb[100]);
  check('P05', 'Drag formula implements 0.5 ρ CdA v² / (m g) + Crr', Math.abs(resistanceG(50) - (0.5 * 1.2 * 0.4 * 50 ** 2 / (260 * 9.80665) + 0.015)) < 1e-12, { at100Kmh: resistanceG(100 / 3.6), at200Kmh: resistanceG(200 / 3.6) });
  const stationary = computeChannels(channels(100, 25, () => 0), 9);
  check('F01', 'Stationary upright data has zero longitudinal demand', stationary.along[50] === 0, { actualG: stationary.along[50], expectedG: 0 });
  const j = computeLoad(uniform.t, f32(uniform.t.map((t) => 0.2 * t)), filled(uniform.t.length, 0));
  check('P06', 'Linear component ramp has analytical component derivative 0.2 g/s', Math.abs(j.loadRate[100] - 0.2) < 1e-5, j.loadRate[100]);
  const dynamic = computeCombined(f32([1, 0]), f32([3, 3]), 0.3);
  check('P07', 'Dynamic metric implements the stated mathematical norm', Math.abs(dynamic[0] - Math.sqrt(1.81)) < 1e-6, Array.from(dynamic));
  const steadyTurn = computeLoad(uniform.t, filled(400, 0), filled(400, 20 ** 2 / (50 * 9.80665)));
  const worldJerk = 20 ** 3 / (50 ** 2 * 9.80665);
  check('F02', 'loadRate is inertial jerk independent of a rotating vehicle frame', Math.abs(steadyTurn.loadRate[100] - worldJerk) < 1e-6, { bodyComponentRate: steadyTurn.loadRate[100], inertialJerkGPerS: worldJerk, speedMps: 20, radiusM: 50 });
  const irregular = channels(300);
  irregular.t = irregular.t.map((t, i) => t + (i >= 150 ? 5 : 0));
  irregular.spd = irregular.t.map((t) => 10 + 2 * t);
  const irregularD = computeChannels(irregular, 9);
  const irregularError = maxAbs(Array.from(irregularD.alongRaw.slice(20, -20), (v) => v - 2 / 9.80665));
  check('F03', 'A constant acceleration remains correct across a timestamp gap', irregularError < 0.01, { actualMaxErrorG: irregularError, trueG: 2 / 9.80665 });

  const single = env([0.8]);
  check('F04', 'Unobserved envelope directions are not presented as measured directional scores', sectorScores(single.env).brake === 0, { score: single.sessionScore, emptyBins: single.emptyBins, sectors: sectorScores(single.env), actualSamples: 1 });
  const spike = env([2.25]);
  check('F05', 'A single plausible spike cannot define the fitted envelope', spike.gref < 2, { gref: spike.gref, score: spike.sessionScore, fitSamples: spike.fitSamples });
  const before = env([...Array(35).fill(0.3), ...Array(12).fill(1.5)]);
  const after = env([...Array(36).fill(0.3), ...Array(12).fill(1.5)]);
  check('F06', 'Envelope score can only grow as data is added', after.sessionScore >= before.sessionScore, { n47Score: before.sessionScore, n48Score: after.sessionScore });
  // Analytical straight-line braking trajectory: v(t)=90−1.5*g*t.
  // Supply exact derived values to isolate the envelope gate from filter edges.
  const brakingSpeeds = Array.from({ length: 100 }, (_, i) => 90 - 1.5 * 9.80665 * i / 25);
  const brakingDemand = brakingSpeeds.map((v) => Math.abs(-1.5 + resistanceG(v)));
  const hardBrake = computeEnvelope({ spdS: f32(brakingSpeeds), comb: f32(brakingDemand), theta: filled(100, -Math.PI / 2), alongRaw: filled(100, -1.5) }, settings);
  check('F07', 'A physically possible 1.5 g net braking event can enter the envelope', hardBrake.fitSamples === 100, { fitSamples: hardBrake.fitSamples, netDecelerationG: 1.5, correctedCombinedGRange: [Math.min(...brakingDemand), Math.max(...brakingDemand)] });

  const badSpeed = channels(); badSpeed.spd[150] = 'missing';
  const speedParsed = parseRaceboxCsv(csv(badSpeed));
  const speedDerived = computeChannels(speedParsed.ch, 9);
  check('F08', 'Missing speed is not silently made into a real 0 m/s reading', speedParsed.ch.spd[150] !== 0, { insertedSpeed: speedParsed.ch.spd[150], maxFalseLongG: maxAbs(speedDerived.alongRaw), dropped: speedParsed.dropped });
  const badLean = channels(300, 25, () => 30, () => 45); badLean.lean[150] = '';
  const leanParsed = parseRaceboxCsv(csv(badLean));
  const leanDerived = computeChannels(leanParsed.ch, 9);
  check('F09', 'Missing lean is not silently made upright', leanParsed.ch.lean[150] !== 0, { insertedLean: leanParsed.ch.lean[150], affectedLateralG: leanDerived.alat[150], expectedLateralG: 1 });
  const inf = channels(); inf.spd[150] = 'Infinity';
  const infParsed = parseRaceboxCsv(csv(inf));
  check('F10', 'CSV numeric channels reject non-finite values', infParsed.ch.spd.every(Number.isFinite), { acceptedInfinity: !Number.isFinite(infParsed.ch.spd[150]) });
  const badCoordinates = channels(); badCoordinates.lat.fill(100); badCoordinates.lon.fill(200);
  let invalidAccepted = false;
  try { invalidAccepted = parseRaceboxCsv(csv(badCoordinates)).n > 0; } catch {}
  check('F11', 'Latitude/longitude outside geographic bounds are rejected', !invalidAccepted, { accepted: invalidAccepted, lat: 100, lon: 200 });
  const meridian = channels(); meridian.lon.fill(0);
  let validAccepted = true;
  try { parseRaceboxCsv(csv(meridian)); } catch { validAccepted = false; }
  check('F12', 'Valid fixes at longitude zero are accepted', validAccepted, { accepted: validAccepted });
  let rejectedTimestamp = csv(channels()).split('\n');
  rejectedTimestamp[102] = rejectedTimestamp[102].replace(/2026[^,]+/, 'bad-clock');
  const timeParsed = parseRaceboxCsv(rejectedTimestamp.join('\n'));
  check('F13', 'Dropped count includes invalid timestamps as documented', timeParsed.dropped === 1, { retained: timeParsed.n, dropped: timeParsed.dropped });
  const lostFix = channels(); lostFix.lat[100] = ''; lostFix.lon[100] = '';
  const parsedFix = parseRaceboxCsv(csv(lostFix));
  const roundTrip = unpackGripData(packGripData(parsedFix));
  check('F14', 'GPS quality provenance survives persistence', roundTrip.noFix === parsedFix.noFix, { beforeNoFix: parsedFix.noFix, afterNoFix: roundTrip.noFix ?? null });
  const longStored = packGripData(parseRaceboxCsv(csv(channels(1000))));
  longStored.ch.spd[1] = null;
  check('F15', 'Stored-data guard catches isolated corrupt elements', !isStoredGripData(longStored), { acceptedCorruptElementAt1: isStoredGripData(longStored), stride: 5 });
  const malformedMeta = packGripData(parseRaceboxCsv(csv(channels())));
  malformedMeta.meta = {};
  let crashed = false;
  try { analyzeGripSession(unpackGripData(malformedMeta), settings); } catch { crashed = true; }
  check('F16', 'Stored-data guard validates the metadata needed by analysis', !isStoredGripData(malformedMeta), { acceptedEmptyMeta: isStoredGripData(malformedMeta), analysisThrows: crashed });
  const singular = channels(100, 25, () => 30, () => 90);
  const singularParsed = parseRaceboxCsv(csv(singular));
  check('F17', 'Singular lean values are rejected or flagged before tan()', maxAbs(computeChannels(singularParsed.ch, 9).alat) < 100, { acceptedLeanDeg: 90, lateralG: computeChannels(singularParsed.ch, 9).alat[50] });
  const ch25 = channels(25, 100);
  let shortAccepted = false;
  try { shortAccepted = parseRaceboxCsv(csv(ch25)).n === 25; } catch {}
  check('F18', 'The advertised one-second minimum uses duration', !shortAccepted, { accepted: shortAccepted, durationS: 0.24 });

  const sanitized = sanitizeGripSettings({ speedSmooth: 8.8, tau: 0 });
  check('F19', 'Settings sanitizer enforces an odd integer speed window', Number.isInteger(sanitized.speedSmooth) && sanitized.speedSmooth % 2 === 1, { storedWindow: sanitized.speedSmooth, actualWindow: 2 * (sanitized.speedSmooth >> 1) + 1, requestedTauZeroBecomes: sanitized.tau });
  check('P08', 'Symmetric moving average preserves a linear sequence in the interior', Math.abs(movAvg([0, 1, 2, 3, 4], 3)[2] - 2) < 1e-6, Array.from(movAvg([0, 1, 2, 3, 4], 3)));
  const simple = channels(251, 25, () => 20, () => 30);
  const flatCorners = detectCorners({ t: simple.t, spdS: f32(simple.spd), leanS: f32(simple.lean), comb: filled(251, Math.tan(Math.PI / 6)), loadRate: filled(251, 0) }, 0, 250, settings);
  check('F20', 'Constant-speed sustained bends are detected as corners', flatCorners.length > 0, { durationS: 10, leanDeg: 30, detections: flatCorners.length });
  const detectionByHz = [10, 25].map((hz) => {
    const ch = channels(20 * hz + 1, hz, (t) => 20 - 3 * Math.exp(-((t - 10) ** 2) / 50), () => 30);
    return { hz, corners: detectCorners({ t: ch.t, spdS: f32(ch.spd), leanS: f32(ch.lean), comb: filled(ch.t.length, 0.6), loadRate: filled(ch.t.length, 0) }, 0, ch.t.length - 1, settings).length };
  });
  check('F30', 'The same smooth corner produces the same detection at 10 and 25 Hz', detectionByHz[0].corners === detectionByHz[1].corners, detectionByHz);
  const p90 = cornerStats({ l: 0, r: 99, ap: 10 }, f32([...Array(99).fill(0.5), 2]));
  check('F21', 'The displayed Peak is the maximum demand', p90.peak === 2, { displayedPeakG: p90.peak, actualPeakG: 2 });
  const clustered = clusterByAxisDistance([{ s: 100, dir: 'L' }, { s: 130, dir: 'R' }]);
  check('F22', 'Opposite-direction bends 30 m apart retain separate turn identities', clustered.length === 2, { groups: clustered });
  const noMeta = { track: '', config: '', date: '', best: null, laps: [] };
  const lapCh = channels(100); lapCh.lap = lapCh.lap.map((_, i) => i < 50 ? 1 : 2);
  const lapDerived = computeChannels(lapCh, 9);
  const built = buildLaps(lapCh, { ...lapDerived, loadRate: filled(100, 0) }, noMeta, settings);
  check('F23', 'Fallback completed-lap duration includes the boundary interval', Math.abs(built[0].time - 2) < 1e-6, { actualS: built[0].time, boundaryToBoundaryS: 2 });
  const repeated = channels(150); repeated.lap = repeated.lap.map((_, i) => i < 50 ? 1 : i < 100 ? 0 : 1);
  const repD = computeChannels(repeated, 9);
  const repLaps = buildLaps(repeated, { ...repD, loadRate: filled(150, 0) }, noMeta, settings);
  check('F24', 'Contiguous lap fragments cannot duplicate a lap identity', new Set(repLaps.map((l) => l.num)).size === repLaps.length, repLaps.map(({ num, start, end }) => ({ num, start, end })));
  check('P09', 'Ideal front-load fraction has the correct acceleration sign', Math.abs(frontWeightFraction(0.5, 0.45) - 0.275) < 1e-12 && Math.abs(frontWeightFraction(-0.5, 0.45) - 0.725) < 1e-12, { drive: frontWeightFraction(0.5, 0.45), brake: frontWeightFraction(-0.5, 0.45) });
  check('F25', 'Weight-transfer display exposes wheel lift at the ideal point-mass threshold', frontWeightFraction(0.5 / 0.45, 0.45) === 0, { modelFraction: frontWeightFraction(0.5 / 0.45, 0.45), physicalFractionAtThreshold: 0 });

  const uu = f32([0, 1, 1, 2]); const vv = f32([0, 1, 2, 3]);
  const exact = valueAtU(uu, vv, 1); const resampled = resampleByDistance(uu, vv, f32([1]))[0];
  check('F26', 'Exact and grid interpolation agree at repeated projected positions', exact === resampled, { exact, resampled });
  const frame = geoFrame(47, 8);
  check('P10', 'WGS84 latitude scale is physically plausible at 47°', frame.ky > 111100 && frame.ky < 111200, frame);
  const g = distanceGrid(1001);
  check('P11', 'Uniform distance grid includes both endpoints', g[0] === 0 && g[g.length - 1] === 1001, { n: g.length, end: g[g.length - 1] });
  const duty = dutyMetres(f32([0, 2, 4, 6]), { along: filled(4, 0.2), comb: filled(4, 0.9), lean: filled(4, 45) }, { section: { sIn: 1, sOut: 5 } });
  check('F27', 'Duty integration measures the complete common section', duty.total === 4, { actualM: duty.total, expectedM: 4 });
  const pretendPartial = { pathLength: 2000, grid: { t: f32([0, 20]) }, path: { te: f32([0, 100]), k0: 0, kEnd: 1 } };
  check('F28', 'Pace on a different layout uses its own complete duration', lapPace(pretendPartial) === 20, { actualMps: lapPace(pretendPartial), ownPathM: 2000, ownDurationS: 100, projectedAxisDurationS: 20 });
  check('F29', 'Payoff only attributes missing grip/line causes when observed', turnPayoff(0.2, 0) === 'unknown-cause', { actualLabel: turnPayoff(0.2, 0), observedTimeDeltaS: 0.2, observedApexScoreDelta: 0, causalInputs: 'none' });
  check('F33', 'Lap-time rounding carries seconds into minutes', formatLapTime(119.999) === '2:00.00', { actual: formatLapTime(119.999), expected: '2:00.00' });

  const transfer = (f, w) => Math.sin(w * Math.PI * f / 25) / (w * Math.sin(Math.PI * f / 25));
  results.observations.filter = [0.5, 1, 2, 3].map((f) => ({ frequencyHz: f, longitudinalAmplitudeRatio: Math.abs(transfer(f, 9) * transfer(f, 5) * Math.sin(6 * Math.PI * f / 25) / (6 * Math.PI * f / 25)) }));
  results.observations.physics = {
    dynamicAtOneGAndThreeGPerS: dynamic[0],
    slope5PercentMissingG: Math.sin(Math.atan(0.05)),
    lean45To50G: Math.tan(50 * Math.PI / 180) - 1,
    lean60ErrorPerDegreeG: (Math.PI / 180) / Math.cos(Math.PI / 3) ** 2,
    steady200KmhHeadwind10MpsMissingG: (0.5 * 1.2 * 0.4 / (260 * 9.80665)) * ((200 / 3.6 + 10) ** 2 - (200 / 3.6) ** 2),
    mass200InsteadOf260At200KmhG: (0.5 * 1.2 * 0.4 * (200 / 3.6) ** 2 / (200 * 9.80665) + 0.015) - resistanceG(200 / 3.6),
  };

  const fixtureNames = ['RaceBox Track Sessionon 06-06-2026 11-50.csv', 'RaceBox Track Sessionon 22-06-2026 14-27.csv'];
  const loaded = [];
  for (const name of fixtureNames) {
    const file = `tests/fixtures/racebox/${name}`;
    if (!existsSync(file)) { results.fixtures.push({ file, status: 'unavailable' }); continue; }
    const text = readFileSync(file, 'utf8');
    const parsed = parseRaceboxCsv(text);
    const a = analyzeGripSession(parsed, settings);
    loaded.push(a);
    const dt = parsed.ch.t.slice(1).map((t, i) => t - parsed.ch.t[i]);
    const best = a.laps.reduce((a, b) => a.time < b.time ? a : b);
    const inputs = a.laps.map((lap) => ({ key: String(lap.num), label: '', sessionId: 'same', analysis: a, lap, metric: a.comb }));
    const cmp = compareLaps(inputs, String(best.num));
    const errors = cmp.laps.map((l) => l.finishDelta - (l.lapTime - best.time)).filter(Number.isFinite);
    const seg = compareSegments(cmp);
    const lengths = a.laps.map((lap) => {
      const path = lapPath(a.ch, lap, frameForLap(a.ch, lap));
      let displayM = 0;
      for (let i = lap.start + 1; i <= lap.end; i++) displayM += Math.hypot(a.px[i] - a.px[i - 1], a.py[i] - a.py[i - 1]);
      return { lap: lap.num, comparisonM: path.s[path.kEnd] - path.s[path.k0], displayM };
    });
    const scoreByWindow = {};
    for (const w of [3, 9, 19]) {
      const c = computeChannels(parsed.ch, w);
      const e = computeEnvelope(c, settings, parsed.ch.lap);
      const l = computeLoad(parsed.ch.t, c.along, c.alat);
      scoreByWindow[w] = { score: e.sessionScore, maxLoadRate: maxAbs(l.loadRate), loadRateP99: q(l.loadRate, 0.99) };
    }
    const budgets = a.laps.map((_, i) => ({ laps: i + 1, score: equalBudgetEnvelope(a, settings, i + 1).sessionScore }));
    let untrustedDisplay = 0;
    for (let i = 0; i < a.n; i++) if (a.ch.lap[i] > 0 && (a.comb[i] > 2.5 || Math.abs(a.alongRaw[i]) > 1.4)) untrustedDisplay++;
    const fixtureResult = {
      file, sha256: createHash('sha256').update(text).digest('hex'), n: a.n, noFix: parsed.noFix, dropped: parsed.dropped,
      durationS: a.ch.t.at(-1), sampleHz: (a.n - 1) / a.ch.t.at(-1), dtMin: Math.min(...dt), dtMedian: q(dt, 0.5), dtMax: Math.max(...dt),
      laps: a.laps.length, turnCount: a.turnCount, cornersPerLap: a.laps.map((l) => l.corners.length),
      sessionScore: a.sessionScore, gref: a.gref, fitSamples: a.fitSamples, emptyBins: a.emptyBins,
      maxCombinedG: maxAbs(a.comb), maxLongRawG: maxAbs(a.alongRaw), maxLoadRate: maxAbs(a.loadRate),
      timedSamplesRejectedFromEnvelopeButStillDisplayed: untrustedDisplay,
      maxLapDeltaErrorS: maxAbs(errors), meanAbsLapDeltaErrorS: errors.reduce((s, x) => s + Math.abs(x), 0) / errors.length,
      verdicts: cmp.laps.map((l) => l.verdict), lengths, scoreByWindow, budgets,
      segmentAdditivityErrorS: maxAbs(cmp.laps.map((l) => seg.totals.find((t) => t.key === l.key).time - l.grid.t.at(-1)).filter(Number.isFinite)),
    };
    results.fixtures.push(fixtureResult);
  }
  if (loaded.length) {
    const original = loaded[0];
    const ch = structuredClone(original.ch);
    const lap = original.laps[0];
    const start = lap.start + 100;
    for (let i = start; i < start + 40; i++) { ch.lat[i] = ch.lat[start - 1]; ch.lon[i] = ch.lon[start - 1]; }
    const a = analyzeGripSession({ ch, meta: original.meta, n: original.n }, settings);
    const input = { key: 'gap-reference', label: '', sessionId: 'same', analysis: a, lap: a.laps[0], metric: a.comb };
    const cmp = compareLaps([input], input.key);
    const lr = cmp.laps[0];
    let actualMaxGapM = 0;
    for (let i = lr.path.k0 + 1; i <= lr.path.kEnd; i++) actualMaxGapM = Math.max(actualMaxGapM, lr.path.s[i] - lr.path.s[i - 1]);
    check('F31', 'Reference-lap GPS gap diagnostics reflect its actual gaps', Math.abs(lr.maxGapM - actualMaxGapM) < 0.01, { reportedMaxGapM: lr.maxGapM, actualMaxGapM, verdict: lr.verdict, coverage: lr.coverage });
    const geoErrors = results.fixtures.flatMap((f) => f.lengths.map((l) => l.displayM - l.comparisonM));
    check('F32', 'Session and comparison screens agree on lap length within one metre', maxAbs(geoErrors) < 1, { minDifferenceM: Math.min(...geoErrors), maxDifferenceM: Math.max(...geoErrors) });
    check('P12', 'Same-session spatial lap deltas agree with supplied RaceBox metadata within 0.01 s', results.fixtures.every((f) => f.maxLapDeltaErrorS < 0.01), results.fixtures.map((f) => ({ file: f.file, maxErrorS: f.maxLapDeltaErrorS })));
    check('P13', 'Segment times telescope to each spatial lap duration', results.fixtures.every((f) => f.segmentAdditivityErrorS < 1e-6), results.fixtures.map((f) => f.segmentAdditivityErrorS));
  }
  if (loaded.length === 2) {
    const inputs = loaded.map((a, i) => ({ key: String(i), label: '', sessionId: String(i), analysis: a, lap: a.laps.reduce((a, b) => a.time < b.time ? a : b), metric: a.comb }));
    results.observations.crossLayout = ['0', '1'].map((refKey) => {
      const cmp = compareLaps(inputs, refKey);
      return { refKey, laps: cmp.laps.map((l) => ({ key: l.key, verdict: l.verdict, sectionFraction: l.sectionFraction, pathLength: l.pathLength, projectedDurationS: l.grid.t.at(-1), ownSampleDurationS: l.path.te[l.path.kEnd] - l.path.te[l.path.k0], reportedPaceKmh: lapPace(l) * 3.6, ownSamplePaceKmh: l.pathLength / (l.path.te[l.path.kEnd] - l.path.te[l.path.k0]) * 3.6, datumShiftM: l.datumShiftM })) };
    });
  }
  results.summary = { supported: results.checks.filter((c) => c.status === 'supported').length, refuted: results.checks.filter((c) => c.status === 'refuted').length };
  mkdirSync('docs/audits', { recursive: true });
  const files = ['src/analysis/grip', 'src/ui/grip'].flatMap((dir) => readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => `${dir}/${f}`));
  files.push('server/src/routes/grip-sessions.ts', 'src/api/repositories/grip-session-repository.ts');
  const inventory = files.sort().map((file) => {
    const source = readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const variables = []; const numericLiterals = [];
    const visit = (node) => {
      const line = () => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertySignature(node)) {
        variables.push({ line: line(), name: node.name.getText(ast), declaration: node.getText(ast).slice(0, 300) });
      }
      if (ts.isNumericLiteral(node)) numericLiterals.push({ line: line(), value: node.getText(ast), context: node.parent.getText(ast).slice(0, 300) });
      ts.forEachChild(node, visit);
    };
    visit(ast);
    return { file, sha256: createHash('sha256').update(source).digest('hex'), lines: source.split('\n').length, variables, numericLiterals };
  });
  writeFileSync('docs/audits/grip-source-inventory.json', JSON.stringify({ note: 'Exhaustive AST inventory, including visual/layout constants. Enumeration is not a proof of physical validity. Long declaration/context excerpts are limited to 300 characters; exact source and line numbers are authoritative.', files: inventory }, null, 2) + '\n');
  writeFileSync('docs/audits/grip-audit-results.json', JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ summary: results.summary, checks: results.checks, observations: results.observations, fixtures: results.fixtures.map(({ lengths, budgets, ...r }) => r) }, null, 2));
  process.exitCode = results.summary.refuted ? 1 : 0;
} finally {
  await server.close();
}
