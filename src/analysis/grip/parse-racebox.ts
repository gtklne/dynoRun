import type { GripLapMeta, GripSessionMeta, ParsedGripSession } from './types';

/**
 * Parse a RaceBox track-session CSV export.
 *
 * The file is a metadata preamble (Track / Configuration / Date / Best Lap
 * Time / Lap N rows) followed by a header row starting with "Record" and one
 * row per 25 Hz sample. Rows with an unparseable timestamp or too few cells
 * are skipped; time is rebased to seconds since the first valid sample.
 */
export function parseRaceboxCsv(text: string): ParsedGripSession {
  const lines = text.split(/\r?\n/);
  const meta: GripSessionMeta = { track: '', config: '', date: '', best: null, laps: [] };
  let dataStart = -1;
  let header: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const key = (cells[0] ?? '').trim();
    if (key === 'Record') {
      header = cells.map((c) => c.trim());
      dataStart = i + 1;
      break;
    }
    if (key === 'Track') meta.track = cells[1]?.trim() ?? '';
    else if (key === 'Configuration') meta.config = cells[1]?.trim() ?? '';
    else if (key === 'Date') meta.date = cells[1]?.trim() ?? '';
    else if (key === 'Best Lap Time') {
      const best = parseFloat(cells[1] ?? '');
      meta.best = Number.isFinite(best) ? best : null;
    } else if (/^Lap\s*\d+/i.test(key)) {
      const time = parseFloat(cells[1] ?? '');
      if (Number.isFinite(time)) meta.laps.push({ name: key, time } satisfies GripLapMeta);
    }
  }

  if (dataStart < 0 || !header) {
    throw new Error("Couldn't find the data header row (expected a line starting with 'Record'). Is this a RaceBox CSV export?");
  }

  const ci = (name: string) => header.indexOf(name);
  const idxTime = ci('Time');
  const idxLat = ci('Latitude');
  const idxLon = ci('Longitude');
  const idxSpd = ci('Speed (m/s)');
  const idxLap = ci('Lap');
  const idxHead = ci('Heading');
  const idxLean = ci('LeanAngle (deg)');
  // Every one of these is load-bearing, and a missing one used to fail in a way
  // that pointed nowhere: without `Time`, Date.parse(undefined) is NaN for every
  // row, so a 23752-sample file was rejected as "under one second of samples".
  // Only Heading is genuinely optional.
  const required: [string, number][] = [
    ['Time', idxTime], ['Latitude', idxLat], ['Longitude', idxLon],
    ['Speed (m/s)', idxSpd], ['Lap', idxLap], ['LeanAngle (deg)', idxLean],
  ];
  const missing = required.filter(([, i]) => i < 0).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Not a supported RaceBox export.`);
  }
  const maxIdx = Math.max(idxTime, idxLat, idxLon, idxSpd, idxLap, idxLean, idxHead);

  const t: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const spd: number[] = [];
  const lean: number[] = [];
  const lap: number[] = [];
  const head: number[] = [];
  let t0: number | null = null;
  // A row without a GPS fix must not become the coordinate 0,0. That is a real
  // place in the Gulf of Guinea, ~5300 km from any circuit, and one such sample
  // stretched the compare axis from 2.7 km to 10 700 km (a 5.4M-element grid per
  // channel per lap) and collapsed the track map to a single dot. Holding the
  // last known fix instead keeps the sample count and the time base intact, so
  // the speed and lean either side stay usable and the existing maxGapM /
  // odoRatio diagnostics are what surface the gap.
  let lastLat = 0;
  let lastLon = 0;
  let firstFix = -1;
  let noFix = 0;
  let dropped = 0;

  for (let i = dataStart; i < lines.length; i++) {
    const c = lines[i].split(',');
    // A short row used to be tolerated within 2 cells of the header width, which
    // silently dropped rows short by 3 and kept rows missing the columns we read.
    if (c.length <= maxIdx) { if (lines[i].trim()) dropped++; continue; }
    const ms = Date.parse(c[idxTime]);
    if (Number.isNaN(ms)) continue;
    if (t0 === null) t0 = ms;
    // Every derivative divides by t[i+3] − t[i−3] and guards that with `dt > 0`,
    // so a repeated or out-of-order timestamp does not degrade the reading, it
    // fabricates an exactly 0 g / 0 g/s plateau. A strictly increasing clock is
    // an invariant, not a nicety.
    const te = (ms - t0) / 1000;
    if (t.length > 0 && te <= t[t.length - 1]) { dropped++; continue; }
    const la = +c[idxLat];
    const lo = +c[idxLon];
    const fixed = Number.isFinite(la) && Number.isFinite(lo) && la !== 0 && lo !== 0;
    if (fixed) {
      lastLat = la;
      lastLon = lo;
      if (firstFix < 0) firstFix = t.length;
    } else {
      noFix++;
    }
    t.push((ms - t0) / 1000);
    lat.push(lastLat);
    lon.push(lastLon);
    spd.push(+c[idxSpd] || 0);
    lean.push(+c[idxLean] || 0);
    lap.push(+c[idxLap] || 0);
    head.push(idxHead >= 0 ? +c[idxHead] || 0 : 0);
  }

  if (t.length < 25) {
    throw new Error('Session is too short to analyze (under one second of samples).');
  }
  // leading rows had nothing to hold; back-fill them from the first real fix
  if (firstFix > 0) {
    for (let i = 0; i < firstFix; i++) { lat[i] = lat[firstFix]; lon[i] = lon[firstFix]; }
  }
  if (firstFix < 0) {
    throw new Error('No GPS fix anywhere in this session. Every position is empty.');
  }

  return { meta, n: t.length, ch: { t, lat, lon, spd, lean, lap, head }, noFix, dropped };
}
