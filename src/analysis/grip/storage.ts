import { GRIP_DATA_VERSION, type GripChannels, type ParsedGripSession } from './types';

/**
 * The jsonb envelope stored in grip_sessions.data. Only the parsed base
 * channels are persisted: every derived channel is recomputed client-side on
 * load, so tuning settings later never invalidates stored sessions.
 */
export interface StoredGripData {
  version: typeof GRIP_DATA_VERSION;
  meta: ParsedGripSession['meta'];
  ch: GripChannels;
}

const round = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

/** Pack a parsed session for storage, trimming float noise to shrink the JSON. */
export function packGripData(parsed: ParsedGripSession): StoredGripData {
  const { ch } = parsed;
  return {
    version: GRIP_DATA_VERSION,
    meta: parsed.meta,
    ch: {
      t: ch.t.map((v) => round(v, 3)),
      lat: ch.lat.map((v) => round(v, 7)),
      lon: ch.lon.map((v) => round(v, 7)),
      spd: ch.spd.map((v) => round(v, 3)),
      lean: ch.lean.map((v) => round(v, 2)),
      lap: ch.lap,
      head: ch.head.map((v) => round(v, 1)),
    },
  };
}

export function unpackGripData(data: StoredGripData): ParsedGripSession {
  return { meta: data.meta, n: data.ch.t.length, ch: data.ch };
}

const CHANNEL_KEYS: (keyof GripChannels)[] = ['t', 'lat', 'lon', 'spd', 'lean', 'lap', 'head'];

/**
 * Guard the stored envelope before it reaches the pipeline. Element types matter,
 * not just array-ness: a channel holding nulls or strings produces an all-NaN
 * analysis (a blank traction circle and a NaN score), with no error path.
 * Sampled rather than exhaustive, because this runs on the render path for a
 * 65k-sample session; a corrupt channel is corrupt in more than one place.
 */
export function isStoredGripData(v: unknown): v is StoredGripData {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  if (d.version !== GRIP_DATA_VERSION || !d.meta || typeof d.meta !== 'object') return false;
  const ch = d.ch as Record<string, unknown> | undefined;
  if (!ch || typeof ch !== 'object') return false;
  const t = ch.t;
  if (!Array.isArray(t) || t.length === 0) return false;
  const stride = Math.max(1, Math.floor(t.length / 200));
  return CHANNEL_KEYS.every((k) => {
    const col = ch[k];
    if (!Array.isArray(col) || col.length !== t.length) return false;
    for (let i = 0; i < col.length; i += stride) {
      if (typeof col[i] !== 'number' || !Number.isFinite(col[i])) return false;
    }
    return typeof col[col.length - 1] === 'number' && Number.isFinite(col[col.length - 1]);
  });
}
