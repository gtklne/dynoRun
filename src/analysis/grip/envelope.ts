import type { GripDerivedChannels, GripEnvelope } from './types';
import type { GripSettings } from './settings';

export const ENVELOPE_BINS = 72;

// The envelope is descriptive (traction-circle boundary + session score), not
// a normaliser, so it is fit near the observed extreme. p99 rather than max
// keeps single noise spikes from owning a bin.
const ENVELOPE_PCT = 99;

// No motorcycle exceeds ~2 g combined (MotoGP braking peaks); anything above
// this is a GPS artifact (signal-reacquisition speed step) and must not set
// the boundary. Display channels are untouched — only the fit ignores them.
const FIT_MAX_G = 2.5;

/** Envelope radius at a g-vector direction (nearest angular bin). */
export function envelopeRadius(env: Float32Array, theta: number): number {
  const b = ((theta + Math.PI) / (2 * Math.PI)) * ENVELOPE_BINS;
  const i = ((Math.floor(b) % ENVELOPE_BINS) + ENVELOPE_BINS) % ENVELOPE_BINS;
  return env[i];
}

/**
 * Fit the rider's empirical traction envelope: per angular bin, the 99th
 * percentile of combined-g across fast-enough samples (timed laps only, when
 * the session has any). Gaps fill from the nearest populated bin; smoothing
 * is max-preserving so the boundary never dips below data it was fit on.
 *
 * The session score is 100 × the RMS envelope radius: an absolute number
 * (100 ≈ working a full 1 g circle) comparable across sessions, bikes and
 * riders — a bigger envelope means more of the g-g plane was actually used.
 */
export function computeEnvelope(
  ch: Pick<GripDerivedChannels, 'spdS' | 'comb' | 'theta'>,
  settings: Pick<GripSettings, 'envMinSpeed'>,
  lap?: ArrayLike<number>,
): GripEnvelope {
  const N = ch.spdS.length;
  const bins: number[][] = Array.from({ length: ENVELOPE_BINS }, () => []);
  const minSpeedMps = settings.envMinSpeed / 3.6;
  let hasTimed = false;
  if (lap) {
    for (let i = 0; i < N; i++) {
      if (lap[i] > 0) { hasTimed = true; break; }
    }
  }
  for (let i = 0; i < N; i++) {
    if (ch.spdS[i] > minSpeedMps && ch.comb[i] <= FIT_MAX_G && (!hasTimed || lap![i] > 0)) {
      const b = ((((ch.theta[i] + Math.PI) / (2 * Math.PI)) * ENVELOPE_BINS) | 0) % ENVELOPE_BINS;
      bins[b].push(ch.comb[i]);
    }
  }

  const raw = new Float32Array(ENVELOPE_BINS);
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    const arr = bins[b];
    if (arr.length) {
      arr.sort((x, y) => x - y);
      raw[b] = arr[Math.min(arr.length - 1, Math.floor((ENVELOPE_PCT / 100) * arr.length))];
    } else {
      raw[b] = NaN;
    }
  }
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    if (Number.isNaN(raw[b])) {
      for (let j = 1; j < ENVELOPE_BINS; j++) {
        const a = raw[(b - j + ENVELOPE_BINS) % ENVELOPE_BINS];
        const c = raw[(b + j) % ENVELOPE_BINS];
        if (!Number.isNaN(a)) { raw[b] = a; break; }
        if (!Number.isNaN(c)) { raw[b] = c; break; }
      }
    }
  }

  const env = new Float32Array(ENVELOPE_BINS);
  const H = 2;
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    let s = 0;
    for (let k = -H; k <= H; k++) s += raw[(b + k + ENVELOPE_BINS) % ENVELOPE_BINS];
    env[b] = Math.max(raw[b], s / (2 * H + 1));
  }

  let gref = 0;
  let sumSq = 0;
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    gref = Math.max(gref, env[b]);
    sumSq += env[b] * env[b];
  }
  const sessionScore = 100 * Math.sqrt(sumSq / ENVELOPE_BINS);

  return { env, gref, sessionScore };
}
