import type { RawSpeedSample } from './types';

/**
 * Keep only the run up to (and including) peak speed. Discards the coast-down,
 * which would otherwise show up as negative power and pollute the RPM bins.
 */
export function trimToAccelPhase(samples: RawSpeedSample[]): RawSpeedSample[] {
  if (samples.length <= 1) return samples;
  let peakIndex = 0;
  let peakSpeed = samples[0].speed_mps;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].speed_mps > peakSpeed) {
      peakSpeed = samples[i].speed_mps;
      peakIndex = i;
    }
  }
  return samples.slice(0, peakIndex + 1);
}
