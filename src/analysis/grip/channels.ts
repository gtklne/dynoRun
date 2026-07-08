import type { GripChannels, GripDerivedChannels } from './types';

export const GRAVITY = 9.80665;

// Fixed generic-race-motorcycle constants — a rough guideline by design, not a
// per-bike calibration: ρ 1.20 kg/m³, CdA 0.40 m², 260 kg bike+rider, Crr 0.015.
const K_DRAG = (0.5 * 1.2 * 0.4) / (260 * GRAVITY); // g per (m/s)²

const CRR = 0.015; // rolling resistance, g

/**
 * Aero drag + rolling resistance the tire must overcome at speed v (m/s), in g.
 * ~0.10 g at 100 km/h, ~0.31 g at 200 km/h.
 */
export function resistanceG(v: number): number {
  return K_DRAG * v * v + CRR;
}

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
 * at 25 Hz) plus resistanceG(v) — dv/dt alone is *vehicle* acceleration, but
 * the tire also carries the drive force that holds speed against drag, and
 * during braking the wind decelerates the body without loading the tire, so
 * the correction shifts `along` from net accel to tire demand in both
 * directions. Lateral g comes from steady-state lean (tan θ), signed.
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
  const alongRaw = movAvg(along, 5);

  const alongT = new Float32Array(N);
  for (let i = 0; i < N; i++) alongT[i] = alongRaw[i] + resistanceG(spdS[i]);

  const alat = new Float32Array(N);
  for (let i = 0; i < N; i++) alat[i] = Math.tan((leanS[i] * Math.PI) / 180);

  const comb = new Float32Array(N);
  const theta = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    comb[i] = Math.hypot(alongT[i], alat[i]);
    theta[i] = Math.atan2(alongT[i], alat[i]); // x = lat, y = long
  }

  return { spdS, leanS, along: alongT, alongRaw, alat, comb, theta };
}
