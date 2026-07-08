import { movAvg } from './channels';
import type { GripDerivedChannels, GripEnvelope } from './types';
import type { GripSettings } from './settings';

export const ENVELOPE_BINS = 72;

/** Envelope radius at a g-vector direction (nearest angular bin). */
export function envelopeRadius(env: Float32Array, theta: number): number {
  const b = ((theta + Math.PI) / (2 * Math.PI)) * ENVELOPE_BINS;
  const i = ((Math.floor(b) % ENVELOPE_BINS) + ENVELOPE_BINS) % ENVELOPE_BINS;
  return env[i];
}

/**
 * Fit the rider's empirical traction envelope: per angular bin, the configured
 * percentile of combined-g across all fast-enough samples. Gaps (directions
 * never visited) fill from the nearest populated bin, then a circular smooth.
 * "100% utilization" therefore means "at your own observed limit", not a
 * textbook one.
 */
export function computeEnvelope(
  ch: Pick<GripDerivedChannels, 'spdS' | 'comb' | 'theta'>,
  settings: Pick<GripSettings, 'envPct' | 'envMinSpeed'>,
): GripEnvelope {
  const N = ch.spdS.length;
  const bins: number[][] = Array.from({ length: ENVELOPE_BINS }, () => []);
  const minSpeedMps = settings.envMinSpeed / 3.6;
  for (let i = 0; i < N; i++) {
    if (ch.spdS[i] > minSpeedMps) {
      const b = ((((ch.theta[i] + Math.PI) / (2 * Math.PI)) * ENVELOPE_BINS) | 0) % ENVELOPE_BINS;
      bins[b].push(ch.comb[i]);
    }
  }

  const env = new Float32Array(ENVELOPE_BINS);
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    const arr = bins[b];
    if (arr.length) {
      arr.sort((x, y) => x - y);
      env[b] = arr[Math.min(arr.length - 1, Math.floor((settings.envPct / 100) * arr.length))];
    } else {
      env[b] = NaN;
    }
  }
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    if (Number.isNaN(env[b])) {
      for (let j = 1; j < ENVELOPE_BINS; j++) {
        const a = env[(b - j + ENVELOPE_BINS) % ENVELOPE_BINS];
        const c = env[(b + j) % ENVELOPE_BINS];
        if (!Number.isNaN(a)) { env[b] = a; break; }
        if (!Number.isNaN(c)) { env[b] = c; break; }
      }
    }
  }

  const smoothed = new Float32Array(ENVELOPE_BINS);
  const H = 2;
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    let s = 0;
    for (let k = -H; k <= H; k++) s += env[(b + k + ENVELOPE_BINS) % ENVELOPE_BINS];
    smoothed[b] = s / (2 * H + 1);
  }

  let gref = 0;
  for (let b = 0; b < ENVELOPE_BINS; b++) gref = Math.max(gref, smoothed[b]);

  const util = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = envelopeRadius(smoothed, ch.theta[i]);
    util[i] = r > 0 ? ch.comb[i] / r : 0;
  }

  return { env: smoothed, gref, util: movAvg(util, 3) };
}
