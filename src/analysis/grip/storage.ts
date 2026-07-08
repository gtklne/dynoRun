import { GRIP_DATA_VERSION, type GripChannels, type ParsedGripSession } from './types';

/**
 * The jsonb envelope stored in grip_sessions.data. Only the parsed base
 * channels are persisted — every derived channel is recomputed client-side on
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

export function isStoredGripData(v: unknown): v is StoredGripData {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  if (d.version !== GRIP_DATA_VERSION || !d.meta || typeof d.meta !== 'object') return false;
  const ch = d.ch as Record<string, unknown> | undefined;
  if (!ch || typeof ch !== 'object') return false;
  const t = ch.t;
  if (!Array.isArray(t)) return false;
  return CHANNEL_KEYS.every((k) => Array.isArray(ch[k]) && (ch[k] as unknown[]).length === t.length);
}
