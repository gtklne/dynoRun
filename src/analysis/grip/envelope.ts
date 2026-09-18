import type { GripDerivedChannels, GripEnvelope } from './types';
import type { GripSettings } from './settings';
import { gapLimit } from './time-series';

export const ENVELOPE_BINS = 72;
/** Engineering summary choices, not validated traction or noise thresholds. */
export const ENVELOPE_MIN_SECONDS = 0.5;
export const ENVELOPE_QUANTILE = 0.95;

export function envelopeRadius(env: Float32Array, theta: number): number {
  if (!Number.isFinite(theta)) return NaN;
  const b = Math.floor(((theta + Math.PI) / (2 * Math.PI)) * ENVELOPE_BINS);
  return env[((b % ENVELOPE_BINS) + ENVELOPE_BINS) % ENVELOPE_BINS];
}

/** Observed, duration-weighted p95 demand by direction. Unknown bins stay unknown.
 * A full-circle RMS is only defined when every direction has support. This is
 * a statistical summary of the recording, never an estimate of tyre capacity.
 * The optional timestamp fallback is for legacy callers sampled at 25 Hz.
 */
export function computeEnvelope(
  ch: Pick<GripDerivedChannels, 'spdS' | 'comb' | 'theta' | 'alongRaw'>,
  settings: Pick<GripSettings, 'envMinSpeed'>,
  lap?: ArrayLike<number>,
  timestamps?: ArrayLike<number>,
): GripEnvelope {
  const N = ch.spdS.length;
  const t = timestamps ?? Float64Array.from({ length: N }, (_, i) => i / 25);
  const limit = gapLimit(t);
  const bins: { g: number; w: number }[][] = Array.from({ length: ENVELOPE_BINS }, () => []);
  const hasTimed = lap ? Array.from(lap).some((n) => n > 0) : false;
  const qualifies = (i: number) => i >= 0 && i < N && Number.isFinite(ch.comb[i]) &&
    Number.isFinite(ch.theta[i]) && ch.spdS[i] >= settings.envMinSpeed / 3.6 && (!hasTimed || lap![i] > 0);
  let fitSamples = 0;
  for (let i = 0; i < N; i++) {
    if (!qualifies(i)) continue;
    let w = 0;
    for (const j of [i - 1, i + 1]) {
      if (!qualifies(j) || (lap && lap[j] !== lap[i])) continue;
      const dt = Math.abs(t[j] - t[i]);
      if (dt <= limit) w += dt / 2;
    }
    if (!(w > 0)) continue;
    const b = Math.floor(((ch.theta[i] + Math.PI) / (2 * Math.PI)) * ENVELOPE_BINS);
    bins[((b % ENVELOPE_BINS) + ENVELOPE_BINS) % ENVELOPE_BINS].push({ g: ch.comb[i], w });
    fitSamples++;
  }
  const env = new Float32Array(ENVELOPE_BINS).fill(NaN);
  let emptyBins = 0;
  let gref = NaN;
  let sumSq = 0;
  bins.forEach((bin, b) => {
    const duration = bin.reduce((sum, p) => sum + p.w, 0);
    if (duration + 1e-9 < ENVELOPE_MIN_SECONDS || bin.length < 2) { emptyBins++; return; }
    bin.sort((a, b) => a.g - b.g);
    let sum = 0;
    for (const p of bin) {
      sum += p.w;
      if (sum >= ENVELOPE_QUANTILE * duration) { env[b] = p.g; break; }
    }
    gref = Number.isFinite(gref) ? Math.max(gref, env[b]) : env[b];
    sumSq += env[b] ** 2;
  });
  return { env, gref, sessionScore: emptyBins ? NaN : 100 * Math.sqrt(sumSq / ENVELOPE_BINS), fitSamples, emptyBins };
}
