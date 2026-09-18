import { timeAverage, timeDerivative } from './time-series';
import type { GripLoadChannels } from './types';

/** Rate of the vehicle-aligned g-g operating point; not inertial jerk or suspension load. */
export function computeLoad(t: number[], along: Float32Array, alat: Float32Array): GripLoadChannels {
  const jLong = timeAverage(t, timeDerivative(t, along), 0.08);
  const jLat = timeAverage(t, timeDerivative(t, alat), 0.08);
  const loadRate = Float32Array.from(jLong, (v, i) => Math.hypot(v, jLat[i]));
  return { jLong, jLat, loadRate };
}

/** Tunable activity index. Dimensional consistency does not make it a tyre force. */
export function computeCombined(comb: Float32Array, loadRate: Float32Array, tau: number): Float32Array {
  const N = comb.length;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = tau === 0 ? comb[i] : Math.hypot(comb[i], tau * loadRate[i]);
  }
  return out;
}

/** Front weight fraction (0..1) from a point-mass model: front ≈ 50% − K·a_long. */
export function frontWeightFraction(alongG: number, K: number): number {
  return Math.max(0, Math.min(1, 0.5 - K * alongG));
}
