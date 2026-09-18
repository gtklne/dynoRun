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
  derived: Pick<GripDerivedChannels, 'spdS' | 'leanS' | 'comb'> & { loadRate: Float32Array },
  meta: GripSessionMeta,
  settings: Pick<GripSettings, 'cornerLean' | 'cornerDrop' | 'mergeGap'>,
): GripLap[] {
  const N = ch.t.length;
  const laps: GripLap[] = [];
  let start = 0;
  const seen = new Set<number>();
  for (let i = 1; i <= N; i++) {
    if (i === N || ch.lap[i] !== ch.lap[i - 1]) {
      const num = ch.lap[start];
      if (num > 0) {
        if (seen.has(num)) throw new Error(`Lap ${num} is not contiguous.`);
        seen.add(num);
        const end = i - 1;
        const m = meta.laps.find((x) => new RegExp('Lap\\s*' + num + '\\b', 'i').test(x.name));
        laps.push({
          num,
          start,
          end,
          time: m && m.time > 0 ? m.time : ch.t[Math.min(i, N - 1)] - ch.t[start],
          estimatedTime: !(m && m.time > 0),
          corners: detectCorners(
            { t: ch.t, spdS: derived.spdS, leanS: derived.leanS, comb: derived.comb, loadRate: derived.loadRate },
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
  const timed = laps.filter((l) => Number.isFinite(l.time) && l.time > 0);
  return timed.reduce((a, b) => (b.time < a.time ? b : a), timed[0]);
}
