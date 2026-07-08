import type { GripChannels, GripDerivedChannels } from './types';

export const GRAVITY = 9.80665;

/** Sliding moving average; the window shrinks at the edges. */
export function movAvg(a: ArrayLike<number>, w: number): Float32Array {
  const N = a.length;
  const out = new Float32Array(N);
  const h = w >> 1;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < N; i++) {
    if (i === 0) {
      for (let j = 0; j <= h && j < N; j++) { sum += a[j]; cnt++; }
    } else {
      const add = i + h;
      const rem = i - h - 1;
      if (add < N) { sum += a[add]; cnt++; }
      if (rem >= 0) { sum -= a[rem]; cnt--; }
    }
    out[i] = sum / cnt;
  }
  return out;
}

/**
 * Derive the g-force channels from raw speed and lean.
 * Longitudinal g is the central difference of smoothed speed (~0.24 s window
 * at 25 Hz); lateral g comes from steady-state lean (tan θ), signed.
 */
export function computeChannels(ch: GripChannels, speedSmooth: number): GripDerivedChannels {
  const { t } = ch;
  const N = ch.t.length;
  const spdS = movAvg(ch.spd, speedSmooth);
  const leanS = movAvg(ch.lean, 5);

  const along = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const lo = Math.max(0, i - 3);
    const hi = Math.min(N - 1, i + 3);
    const dt = t[hi] - t[lo];
    along[i] = dt > 0 ? ((spdS[hi] - spdS[lo]) / dt) / GRAVITY : 0;
  }
  const alongS = movAvg(along, 5);

  const alat = new Float32Array(N);
  for (let i = 0; i < N; i++) alat[i] = Math.tan((leanS[i] * Math.PI) / 180);

  const comb = new Float32Array(N);
  const theta = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    comb[i] = Math.hypot(alongS[i], alat[i]);
    theta[i] = Math.atan2(alongS[i], alat[i]); // x = lat, y = long
  }

  return { spdS, leanS, along: alongS, alat, comb, theta };
}
