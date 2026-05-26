import type { DifferentiatedSample, RawSpeedSample, SmoothedSample } from './types';

export type RunQualityRating = 'good' | 'fair' | 'poor';

export type RunQualityFlag =
  | 'short_run'
  | 'low_sample_density'
  | 'noisy_speed'
  | 'acceleration_spikes'
  | 'gps_dropouts';

export interface RunQuality {
  score: number;
  rating: RunQualityRating;
  flags: RunQualityFlag[];
  sample_count: number;
  duration_s: number;
  avg_fix_rate_hz: number;
  max_gap_ms: number;
  speed_rmse_mps: number;
  peak_abs_accel_ms2: number;
}

export interface RunQualityInput {
  raw: RawSpeedSample[];
  smoothed: SmoothedSample[];
  differentiated: DifferentiatedSample[];
}

// Anything above this is unrealistic for a road-legal vehicle and almost
// always indicates GPS glitch or wheelspin event.
const PEAK_ACCEL_SUSPICIOUS_MS2 = 12;

// Gaps larger than this between raw fixes are treated as a GPS dropout.
const MAX_ACCEPTABLE_GAP_MS = 500;

// Anything less than ~3s of useful acceleration produces unreliable curves.
const MIN_RELIABLE_DURATION_S = 3;

// Below ~2 Hz we lose enough resolution that accel times become unreliable.
const MIN_RELIABLE_FIX_RATE_HZ = 2;

// Speed RMSE between raw and smoothed signals — beyond this we're chasing noise.
const NOISY_SPEED_RMSE_MPS = 0.6;

export function computeRunQuality(input: RunQualityInput): RunQuality {
  const { raw, smoothed, differentiated } = input;

  if (raw.length < 2) {
    return {
      score: 0,
      rating: 'poor',
      flags: ['short_run', 'low_sample_density'],
      sample_count: raw.length,
      duration_s: 0,
      avg_fix_rate_hz: 0,
      max_gap_ms: 0,
      speed_rmse_mps: 0,
      peak_abs_accel_ms2: 0,
    };
  }

  const duration_s = (raw[raw.length - 1].t_ms - raw[0].t_ms) / 1000;

  let maxGap = 0;
  for (let i = 1; i < raw.length; i++) {
    const gap = raw[i].t_ms - raw[i - 1].t_ms;
    if (gap > maxGap) maxGap = gap;
  }
  const avg_fix_rate_hz = duration_s > 0 ? (raw.length - 1) / duration_s : 0;

  // RMSE between raw and smoothed at matching nearest time. Smoothed is
  // resampled to a uniform grid, so iterate raw and look up nearest smoothed.
  let speedRmse = 0;
  if (smoothed.length > 0) {
    let sumSq = 0;
    let n = 0;
    let j = 0;
    for (const r of raw) {
      while (j < smoothed.length - 1 && smoothed[j + 1].t_ms < r.t_ms) j++;
      const a = smoothed[j];
      const b = smoothed[Math.min(j + 1, smoothed.length - 1)];
      let predicted = a.speed_mps;
      if (a.t_ms !== b.t_ms && r.t_ms >= a.t_ms && r.t_ms <= b.t_ms) {
        const frac = (r.t_ms - a.t_ms) / (b.t_ms - a.t_ms);
        predicted = a.speed_mps + frac * (b.speed_mps - a.speed_mps);
      }
      const d = r.speed_mps - predicted;
      sumSq += d * d;
      n++;
    }
    if (n > 0) speedRmse = Math.sqrt(sumSq / n);
  }

  let peakAbsAccel = 0;
  for (const d of differentiated) {
    const a = Math.abs(d.accel_ms2);
    if (a > peakAbsAccel) peakAbsAccel = a;
  }

  const flags: RunQualityFlag[] = [];
  if (duration_s < MIN_RELIABLE_DURATION_S) flags.push('short_run');
  if (avg_fix_rate_hz < MIN_RELIABLE_FIX_RATE_HZ) flags.push('low_sample_density');
  if (maxGap > MAX_ACCEPTABLE_GAP_MS) flags.push('gps_dropouts');
  if (speedRmse > NOISY_SPEED_RMSE_MPS) flags.push('noisy_speed');
  if (peakAbsAccel > PEAK_ACCEL_SUSPICIOUS_MS2) flags.push('acceleration_spikes');

  let score = 100;
  if (flags.includes('short_run')) {
    const ratio = Math.max(0, Math.min(1, duration_s / MIN_RELIABLE_DURATION_S));
    score -= Math.round(35 * (1 - ratio));
  }
  if (flags.includes('low_sample_density')) {
    const ratio = Math.max(0, Math.min(1, avg_fix_rate_hz / MIN_RELIABLE_FIX_RATE_HZ));
    score -= Math.round(20 * (1 - ratio));
  }
  if (flags.includes('gps_dropouts')) {
    const excess = Math.min(2000, maxGap - MAX_ACCEPTABLE_GAP_MS);
    score -= 5 + Math.round((excess / 1500) * 15);
  }
  if (flags.includes('noisy_speed')) {
    const ratio = Math.min(2, speedRmse / NOISY_SPEED_RMSE_MPS);
    score -= Math.round(10 + ratio * 5);
  }
  if (flags.includes('acceleration_spikes')) {
    score -= 15;
  }

  score = Math.max(0, Math.min(100, score));
  const rating: RunQualityRating = score >= 75 ? 'good' : score >= 50 ? 'fair' : 'poor';

  return {
    score,
    rating,
    flags,
    sample_count: raw.length,
    duration_s,
    avg_fix_rate_hz,
    max_gap_ms: maxGap,
    speed_rmse_mps: speedRmse,
    peak_abs_accel_ms2: peakAbsAccel,
  };
}
