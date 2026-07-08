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
  if (idxLean < 0 || idxSpd < 0) {
    throw new Error('Missing required columns (Speed / LeanAngle). Not a supported RaceBox export.');
  }

  const t: number[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const spd: number[] = [];
  const lean: number[] = [];
  const lap: number[] = [];
  const head: number[] = [];
  let t0: number | null = null;

  for (let i = dataStart; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < header.length - 2) continue; // blanks / trailing junk
    const ms = Date.parse(c[idxTime]);
    if (Number.isNaN(ms)) continue;
    if (t0 === null) t0 = ms;
    t.push((ms - t0) / 1000);
    lat.push(idxLat >= 0 ? +c[idxLat] || 0 : 0);
    lon.push(idxLon >= 0 ? +c[idxLon] || 0 : 0);
    spd.push(+c[idxSpd] || 0);
    lean.push(+c[idxLean] || 0);
    lap.push(idxLap >= 0 ? +c[idxLap] || 0 : 0);
    head.push(idxHead >= 0 ? +c[idxHead] || 0 : 0);
  }

  if (t.length < 25) {
    throw new Error('Session is too short to analyze (under one second of samples).');
  }

  return { meta, n: t.length, ch: { t, lat, lon, spd, lean, lap, head } };
}
