import type { GripDerivedChannels, GripEnvelope } from './types';
import type { GripSettings } from './settings';

export const ENVELOPE_BINS = 72;

// The envelope is descriptive (traction-circle boundary + session score), not a
// normaliser, so it is fit near the observed extreme — but it must not be fit ON
// a noise spike, and a percentile alone cannot promise that. At 1% it discards
// floor(n/100) samples, while most angular bins hold well under 100, so for them
// "p99" was literally the bin maximum. Meanwhile the channel pipeline's smoothing
// and central difference smear one bad fix across ~10 consecutive samples.
//
// So the rule is a minimum *count*, not a percentile: the boundary has to be
// exceeded for DROP_MIN samples — 0.48 s at 25 Hz — before it moves. That is the
// physical distinction being drawn. Real cornering at the limit lasts one to
// three seconds; a reacquisition step or a lean-sensor spike lasts under half of
// one. Measured on both real fixtures, injecting a 10-sample 2.25 g artifact:
//   drop  5 → sessionScore +4.2/+4.8 points, gref 1.27 → 2.25 g   (a lie)
//   drop 12 → sessionScore +0.05/+0.09,      gref unchanged
// The price is ~2.4–3.2 points of absolute level on clean data, applied equally
// to every session, which is the right trade for a score only read comparatively.
const ENVELOPE_PCT = 99;
const DROP_MIN = 12;

// …but never more than a quarter of a bin. A sparse bin (a direction barely
// visited, 2–4 samples on a single-lap fit) would otherwise be erased entirely.
const DROP_MAX_FRACTION = 0.25;

// No motorcycle exceeds ~2 g combined (MotoGP braking peaks); anything above
// this is a GPS artifact (signal-reacquisition speed step) and must not set
// the boundary. Display channels are untouched — only the fit ignores them.
const FIT_MAX_G = 2.5;

// The combined cap alone leaves a gap: a signal reacquisition produces a speed
// *step*, and after smoothing and differentiation that lands ~10 samples at
// 1.5–2.5 g — plausible enough to pass FIT_MAX_G, large enough to own a bin.
// Longitudinally the physics is far tighter than laterally: a bike is
// wheelie-limited on drive and stoppie-limited on the brake, so beyond this it is
// not a tyre, it is arithmetic on a discontinuity. Lateral g is deliberately not
// capped this hard — that is where a real rider's numbers live.
const FIT_MAX_LONG_G = 1.4;

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
  ch: Pick<GripDerivedChannels, 'spdS' | 'comb' | 'theta' | 'alongRaw'>,
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
    if (
      ch.spdS[i] > minSpeedMps &&
      ch.comb[i] <= FIT_MAX_G &&
      Math.abs(ch.alongRaw[i]) <= FIT_MAX_LONG_G &&
      (!hasTimed || lap![i] > 0)
    ) {
      const b = ((((ch.theta[i] + Math.PI) / (2 * Math.PI)) * ENVELOPE_BINS) | 0) % ENVELOPE_BINS;
      bins[b].push(ch.comb[i]);
    }
  }

  const raw = new Float32Array(ENVELOPE_BINS);
  let fitSamples = 0;
  let emptyBins = 0;
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    const arr = bins[b];
    fitSamples += arr.length;
    if (arr.length) {
      arr.sort((x, y) => x - y);
      const drop = Math.min(
        Math.max(DROP_MIN, Math.ceil((1 - ENVELOPE_PCT / 100) * arr.length)),
        Math.floor(DROP_MAX_FRACTION * arr.length),
      );
      raw[b] = arr[Math.max(0, arr.length - 1 - drop)];
    } else {
      raw[b] = NaN;
      emptyBins++;
    }
  }

  // Nothing qualified — a slow session, or envMinSpeed raised above everything
  // ridden. There is no envelope; say so with zeros rather than letting NaN
  // reach a score in the header and a moveTo() on the traction circle.
  if (fitSamples === 0) {
    return { env: new Float32Array(ENVELOPE_BINS), gref: 0, sessionScore: 0, fitSamples: 0, emptyBins: ENVELOPE_BINS };
  }

  // Fill empty bins from the nearest bin that has data *of its own*. Reading
  // back from `raw` while filling it would cascade instead: with bins 0 and 36
  // populated, bin 1 copies the value bin 0 just received, bin 2 copies bin 1,
  // and half the circle ends up at the wrong bin's radius.
  const seeded = Float32Array.from(raw);
  for (let b = 0; b < ENVELOPE_BINS; b++) {
    if (!Number.isNaN(seeded[b])) continue;
    for (let j = 1; j <= ENVELOPE_BINS >> 1; j++) {
      const a = seeded[(b - j + ENVELOPE_BINS) % ENVELOPE_BINS];
      const c = seeded[(b + j) % ENVELOPE_BINS];
      const an = !Number.isNaN(a);
      const cn = !Number.isNaN(c);
      // equidistant on both sides: the smaller radius is the safer boundary
      if (an && cn) { raw[b] = Math.min(a, c); break; }
      if (an) { raw[b] = a; break; }
      if (cn) { raw[b] = c; break; }
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

  return { env, gref, sessionScore, fitSamples, emptyBins };
}
