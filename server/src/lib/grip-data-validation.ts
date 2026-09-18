// Shared, dependency-free wire contract. The browser imports this module too;
// it lives inside the API's rootDir so the deployed server can build it normally.
export const MAX_GRIP_SAMPLES = 500_000;
export const MAX_GRIP_DATA_VERSION = 2;

export interface GripDataEnvelope {
  version: number;
  meta: { track: string; config: string; date: string; best: number | null; laps: { name: string; time: number }[] };
  ch: { t: number[]; lat: number[]; lon: number[]; spd: number[]; lean: number[]; lap: number[]; head: number[]; positionValid?: boolean[] };
  noFix?: number;
  dropped?: number;
}

export function isGripDataEnvelope(v: unknown): v is GripDataEnvelope {
  if (!v || typeof v !== 'object') return false;
  const d = v as GripDataEnvelope;
  if (!Number.isInteger(d.version) || d.version < 1 || d.version > MAX_GRIP_DATA_VERSION) return false;
  const m = d.meta;
  if (!m || typeof m !== 'object' || !(['track', 'config', 'date'] as const).every((k) => typeof m[k] === 'string')) return false;
  if (m.best !== null && !(Number.isFinite(m.best) && m.best > 0)) return false;
  if (!Array.isArray(m.laps) || !Array.from(m.laps).every((l) => l && typeof l.name === 'string' && Number.isFinite(l.time) && l.time > 0)) return false;
  const ch = d.ch;
  if (!ch || !Array.isArray(ch.t) || ch.t.length < 2 || ch.t.length > MAX_GRIP_SAMPLES) return false;
  const n = ch.t.length;
  for (const key of ['t', 'lat', 'lon', 'spd', 'lean', 'lap', 'head'] as const) {
    if (!Array.isArray(ch[key]) || ch[key].length !== n) return false;
  }
  if (ch.positionValid !== undefined && (!Array.isArray(ch.positionValid) || ch.positionValid.length !== n || !Array.from(ch.positionValid).every((x) => typeof x === 'boolean') || !ch.positionValid.some(Boolean))) return false;
  if (ch.t[0] !== 0 || ch.t[n - 1] < 1) return false;
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (const key of ['t', 'lat', 'lon', 'spd', 'lean', 'lap', 'head'] as const) {
      if (typeof ch[key][i] !== 'number' || !Number.isFinite(ch[key][i])) return false;
    }
    if (i && ch.t[i] <= ch.t[i - 1]) return false;
    if (Math.abs(ch.lat[i]) > 90 || Math.abs(ch.lon[i]) > 180 || ch.spd[i] < 0 || Math.abs(ch.lean[i]) >= 90) return false;
    if (!Number.isInteger(ch.lap[i]) || ch.lap[i] < 0) return false;
    if (ch.lap[i] > 0 && (i === 0 || ch.lap[i] !== ch.lap[i - 1])) {
      if (seen.has(ch.lap[i])) return false;
      seen.add(ch.lap[i]);
    }
  }
  for (const key of ['noFix', 'dropped'] as const) {
    if (d[key] !== undefined && (!Number.isInteger(d[key]) || d[key]! < 0)) return false;
  }
  if (d.noFix !== undefined && (d.noFix > n || (ch.positionValid && d.noFix !== ch.positionValid.filter((v) => !v).length))) return false;
  return true;
}
