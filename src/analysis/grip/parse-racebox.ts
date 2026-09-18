import { isGripDataEnvelope, MAX_GRIP_SAMPLES } from '../../../server/src/lib/grip-data-validation';
import { GRIP_DATA_VERSION } from './types';
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
  const rows = csvRows(text.replace(/^\uFEFF/, ''));
  const meta: GripSessionMeta = { track: '', config: '', date: '', best: null, laps: [] };
  let dataStart = -1;
  let header: string[] | null = null;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
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
      const best = duration(cells[1] ?? '');
      meta.best = Number.isFinite(best) && best > 0 ? best : null;
    } else if (/^Lap\s*\d+/i.test(key)) {
      const time = duration(cells[1] ?? '');
      if (Number.isFinite(time) && time > 0) meta.laps.push({ name: key, time } satisfies GripLapMeta);
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
  for (const [name] of required) {
    if (header.filter((h) => h === name).length > 1) throw new Error(`Duplicate required column: ${name}.`);
  }
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
  const positionValid: boolean[] = [];
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

  for (let i = dataStart; i < rows.length; i++) {
    const c = rows[i];
    // A short row used to be tolerated within 2 cells of the header width, which
    // silently dropped rows short by 3 and kept rows missing the columns we read.
    if (c.length <= maxIdx) { if (c.some((v) => v.trim())) dropped++; continue; }
    const ms = Date.parse(c[idxTime]);
    if (Number.isNaN(ms)) { dropped++; continue; }
    if (t0 === null) t0 = ms;
    // Every derivative divides by t[i+3] − t[i−3] and guards that with `dt > 0`,
    // so a repeated or out-of-order timestamp does not degrade the reading, it
    // fabricates an exactly 0 g / 0 g/s plateau. A strictly increasing clock is
    // an invariant, not a nicety.
    const te = (ms - t0) / 1000;
    if (t.length > 0 && te <= t[t.length - 1]) { dropped++; continue; }
    const read = (idx: number, valid: (n: number) => boolean): number => {
      const n = Number(c[idx]);
      if (!c[idx].trim() || !Number.isFinite(n) || !valid(n)) {
        throw new Error(`Invalid ${header![idx]} in CSV row ${i + 1}. Correct the export before importing.`);
      }
      return n;
    };
    const speed = read(idxSpd, (v) => v >= 0);
    const angle = read(idxLean, (v) => Math.abs(v) < 90);
    const lapNum = read(idxLap, (v) => Number.isInteger(v) && v >= 0);
    const la = c[idxLat].trim() ? read(idxLat, (v) => Math.abs(v) <= 90) : NaN;
    const lo = c[idxLon].trim() ? read(idxLon, (v) => Math.abs(v) <= 180) : NaN;
    // RaceBox's 0,0 sentinel is missing; a single zero coordinate is valid.
    const fixed = Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0);
    positionValid.push(fixed);
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
    spd.push(speed);
    lean.push(angle);
    lap.push(lapNum);
    head.push(idxHead >= 0 && c[idxHead].trim() ? read(idxHead, () => true) : 0);
    if (t.length > MAX_GRIP_SAMPLES) throw new Error(`Session exceeds ${MAX_GRIP_SAMPLES} samples.`);
  }

  if (t.length < 2 || t[t.length - 1] - t[0] < 1) {
    throw new Error('Session is too short to analyze (under one second of samples).');
  }
  // leading rows had nothing to hold; back-fill them from the first real fix
  if (firstFix > 0) {
    for (let i = 0; i < firstFix; i++) { lat[i] = lat[firstFix]; lon[i] = lon[firstFix]; }
  }
  if (firstFix < 0) {
    throw new Error('No GPS fix anywhere in this session. Every position is empty.');
  }

  const ch = { t, lat, lon, spd, lean, lap, head, positionValid };
  if (!isGripDataEnvelope({ version: GRIP_DATA_VERSION, meta, ch, noFix, dropped })) {
    throw new Error('Invalid session: timed lap numbers must identify one contiguous lap each.');
  }
  return { meta, n: t.length, ch, noFix, dropped };
}

/** Numeric seconds or an explicit minutes:seconds duration. */
function duration(s: string): number {
  const parts = s.trim().split(':');
  if (parts.length === 1) return Number(parts[0]);
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return NaN;
  const seconds = Number(parts[1]);
  return seconds >= 0 && seconds < 60 ? Number(parts[0]) * 60 + seconds : NaN;
}

/** Quoting, escaped quotes, commas and newlines inside quoted fields. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closedQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted) { quoted = false; closedQuote = true; }
      else if (field.length === 0 && !closedQuote) quoted = true;
      else throw new Error('Unexpected quote in CSV field.');
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(field); field = ''; closedQuote = false;
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else if (closedQuote) {
      if (c.trim()) throw new Error('Unexpected text after quoted CSV field.');
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
