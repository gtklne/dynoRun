import { movAvg } from './channels';
import type { GripLoadChannels } from './types';

/**
 * Transient channels: the rate of change of the g-g operating point (jerk).
 * jLong = fore/aft transfer rate (dive/squat), jLat = side/side (flick),
 * loadRate = |dG/dt| — how fast the whole load state is moving. The magnitude
 * is frame-independent, so a hard throttle↔brake swap reads hot even while
 * net g passes through zero.
 */
export function computeLoad(t: number[], along: Float32Array, alat: Float32Array): GripLoadChannels {
  const N = t.length;
  const jL = new Float32Array(N);
  const jT = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const lo = Math.max(0, i - 3);
    const hi = Math.min(N - 1, i + 3);
    const dt = t[hi] - t[lo];
    jL[i] = dt > 0 ? (along[hi] - along[lo]) / dt : 0;
    jT[i] = dt > 0 ? (alat[hi] - alat[lo]) / dt : 0;
  }
  const jLong = movAvg(jL, 5);
  const jLat = movAvg(jT, 5);
  const loadRate = new Float32Array(N);
  for (let i = 0; i < N; i++) loadRate[i] = Math.hypot(jLong[i], jLat[i]);
  return { jLong, jLat, loadRate };
}

/**
 * Dynamic-load metric: steady-state grip demand with the transient folded in
 * as an orthogonal demand — hypot(comb, τ·loadRate). τ (seconds) × g/s = g,
 * so the mix is dimensionally a g demand on the same absolute scale as comb.
 * Depends only on τ, so it can be re-mixed without re-deriving anything else.
 */
export function computeCombined(comb: Float32Array, loadRate: Float32Array, tau: number): Float32Array {
  const N = comb.length;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    out[i] = Math.hypot(comb[i], tau * loadRate[i]);
  }
  return out;
}

/** Front weight fraction (0..1) from a point-mass model: front ≈ 50% − K·a_long. */
export function frontWeightFraction(alongG: number, K: number): number {
  return Math.max(0.02, Math.min(0.98, 0.5 - K * alongG));
}
