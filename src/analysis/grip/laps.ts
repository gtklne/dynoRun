import { detectCorners } from './corners';
import type { GripChannels, GripDerivedChannels, GripLap, GripSessionMeta } from './types';
import type { GripSettings } from './settings';

/**
 * Group contiguous samples by lap number into timed laps (lap 0 = out/in/pit
 * is dropped). Lap time comes from the CSV metadata when present, else from
 * the sample timestamps. Corners are detected per lap.
 */
export function buildLaps(
  ch: GripChannels,
  derived: Pick<GripDerivedChannels, 'spdS' | 'leanS'> & { util: Float32Array; loadRate: Float32Array },
  meta: GripSessionMeta,
  settings: Pick<GripSettings, 'cornerLean' | 'cornerDrop' | 'mergeGap'>,
): GripLap[] {
  const N = ch.t.length;
  const laps: GripLap[] = [];
  let start = 0;
  for (let i = 1; i <= N; i++) {
    if (i === N || ch.lap[i] !== ch.lap[i - 1]) {
      const num = ch.lap[start];
      if (num > 0) {
        const end = i - 1;
        const m = meta.laps.find((x) => new RegExp('Lap\\s*' + num + '\\b', 'i').test(x.name));
        laps.push({
          num,
          start,
          end,
          time: m ? m.time : ch.t[end] - ch.t[start],
          corners: detectCorners(
            { t: ch.t, spdS: derived.spdS, leanS: derived.leanS, util: derived.util, loadRate: derived.loadRate },
            start,
            end,
            settings,
          ),
        });
      }
      start = i;
    }
  }
  laps.sort((a, b) => a.num - b.num);
  return laps;
}

export function bestLap(laps: GripLap[]): GripLap {
  return laps.reduce((a, b) => (b.time < a.time ? b : a), laps[0]);
}
