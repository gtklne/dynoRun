import { isGripDataEnvelope } from '../../../server/src/lib/grip-data-validation';
import { GRIP_DATA_VERSION, type GripChannels, type ParsedGripSession } from './types';

/**
 * The jsonb envelope stored in grip_sessions.data. Only the parsed base
 * channels are persisted: every derived channel is recomputed client-side on
 * load, so tuning settings later never invalidates stored sessions.
 */
export interface StoredGripData {
  version: 1 | typeof GRIP_DATA_VERSION;
  meta: ParsedGripSession['meta'];
  ch: GripChannels;
  noFix?: number;
  dropped?: number;
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
    noFix: parsed.noFix,
    dropped: parsed.dropped,
    ch: {
      t: [...ch.t],
      lat: ch.lat.map((v) => round(v, 7)),
      lon: ch.lon.map((v) => round(v, 7)),
      spd: ch.spd.map((v) => round(v, 3)),
      lean: [...ch.lean],
      lap: [...ch.lap],
      positionValid: ch.positionValid ? [...ch.positionValid] : undefined,
      head: ch.head.map((v) => round(v, 1)),
    },
  };
}

export function unpackGripData(data: StoredGripData): ParsedGripSession {
  return { meta: data.meta, n: data.ch.t.length, ch: data.ch, noFix: data.noFix, dropped: data.dropped };
}

/** Exhaustively validate the same wire contract as the API. */
export function isStoredGripData(v: unknown): v is StoredGripData {
  return isGripDataEnvelope(v);
}
