import type { RawSpeedSample } from './types';
import { resample } from './resample';
import { smoothSavitzkyGolay } from './smooth';
import { trimToAccelPhase } from './trim-to-peak';
import { PEAK_ACCEL_SUSPICIOUS_MS2 } from './run-quality';
import { GRAVITY_M_S2 } from './road-load-defaults';

// Two consecutive fixes whose speeds match this closely did not both come from
// a fresh Doppler solution: the receiver repeated a stale value. Doppler speed
// noise sits in the cm/s range, so a genuine steady cruise never produces a
// repeat this exact. The window has to survive the float32 round-trip through
// the `samples.speed_mps` real column (observed drift ~2e-6 m/s), hence 1e-3
// rather than an equality test.
export const FROZEN_SPEED_EPS_MPS = 1e-3;

// A repeat at walking pace is just a vehicle that is not moving, which is not
// worth flagging. Only repeats fast enough to matter for a pull are reported.
export const FROZEN_MIN_SPEED_MPS = 3;

// Fix-to-fix gaps beyond this are dropouts rather than jitter. Matches the
// threshold run-quality uses for its `gps_dropouts` flag.
export const RAW_GAP_MS = 500;

// ...but an absolute floor alone cannot identify a dropout, because it does not
// know what this receiver's normal cadence is. A phone delivering a steady 1 Hz
// clears 500 ms on EVERY interval, so the flag fired on all 11 intervals of a
// perfectly regular run and drowned out the three findings that mattered. A
// dropout is a hole relative to the run's own median spacing, so a fix must be
// both absolutely late and this many times the median before it counts.
export const GAP_MEDIAN_FACTOR = 2.5;

export type RawFixFlag = 'frozen' | 'spike' | 'gap';

export interface RawTracePoint {
  t_ms: number;
  speed_mps: number;
  // Backward difference against the PREVIOUS RAW FIX, null on the first one.
  // Deliberately not the pipeline's smoothed derivative: the whole point of
  // this readout is to show what the receiver actually reported, before any
  // filtering had a chance to make it look reasonable.
  accel_ms2: number | null;
  dt_ms: number | null;
  flags: RawFixFlag[];
  // Inside the accel phase the pipeline kept (trimToAccelPhase cuts at peak
  // speed). Everything after this was measured but never fed to the maths.
  used: boolean;
}

export interface RawTrace {
  points: RawTracePoint[];
  // The grid analyzeRun actually differentiated: trim, resample, Savitzky-Golay
  // with the same parameters. Overlaying it on the raw fixes is what makes a
  // no-op smoother visible, at a low fix rate the two traces sit on top of each
  // other because the window spans barely one real fix.
  smoothed: Array<{ t_ms: number; speed_mps: number }>;
  fix_rate_hz: number;
  frozen_count: number;
  spike_count: number;
  gap_count: number;
  peak_raw_accel_ms2: number;
  // Index into `points` of the last fix the pipeline kept, -1 when empty.
  trim_index: number;
  // This run's own fix cadence, and the threshold a gap had to beat to be
  // called a dropout rather than that cadence.
  median_gap_ms: number;
  gap_ceiling_ms: number;
}

export interface RawTraceOptions {
  resample_step_ms?: number;
  smooth_window?: number;
  // Acceleration beyond which a fix-to-fix step is treated as an artifact.
  // Defaults to run-quality's ceiling, which is just above the ~1.1 g any road
  // tyre can deliver, so exceeding it means the signal, not the vehicle.
  accel_ceiling_ms2?: number;
}

/**
 * Per-fix diagnostic view of a run's raw speed signal.
 *
 * Pure. Everything here is derived from the stored samples; nothing is a
 * judgement about the vehicle, only about whether the measurement can carry
 * the number the pipeline printed from it.
 */
export function buildRawTrace(
  samples: RawSpeedSample[],
  options: RawTraceOptions = {},
): RawTrace {
  const step = options.resample_step_ms ?? 100;
  const window = options.smooth_window ?? 11;
  const ceiling = options.accel_ceiling_ms2 ?? PEAK_ACCEL_SUSPICIOUS_MS2;

  const sorted = [...samples].sort((a, b) => a.t_ms - b.t_ms);
  const medianDtMs = medianGap(sorted);
  const gapCeilingMs = Math.max(RAW_GAP_MS, medianDtMs * GAP_MEDIAN_FACTOR);
  const trimmed = trimToAccelPhase(sorted);
  const trim_index = trimmed.length - 1;

  const points: RawTracePoint[] = sorted.map((s, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const dt_ms = prev ? s.t_ms - prev.t_ms : null;
    const dt_s = dt_ms != null ? dt_ms / 1000 : null;
    const accel_ms2 =
      prev != null && dt_s != null && dt_s > 0 ? (s.speed_mps - prev.speed_mps) / dt_s : null;

    const flags: RawFixFlag[] = [];
    if (
      prev != null &&
      Math.abs(s.speed_mps - prev.speed_mps) < FROZEN_SPEED_EPS_MPS &&
      s.speed_mps >= FROZEN_MIN_SPEED_MPS
    ) {
      flags.push('frozen');
    }
    if (accel_ms2 != null && Math.abs(accel_ms2) > ceiling) flags.push('spike');
    if (dt_ms != null && dt_ms > gapCeilingMs) flags.push('gap');

    return { t_ms: s.t_ms, speed_mps: s.speed_mps, accel_ms2, dt_ms, flags, used: i <= trim_index };
  });

  const duration_s = points.length > 1 ? (points[points.length - 1].t_ms - points[0].t_ms) / 1000 : 0;

  let peak_raw_accel_ms2 = 0;
  for (const p of points) {
    if (p.accel_ms2 != null && Math.abs(p.accel_ms2) > peak_raw_accel_ms2) {
      peak_raw_accel_ms2 = Math.abs(p.accel_ms2);
    }
  }

  return {
    points,
    smoothed: smoothSavitzkyGolay(resample(trimmed, step), window).map((s) => ({
      t_ms: s.t_ms,
      speed_mps: s.speed_mps,
    })),
    fix_rate_hz: duration_s > 0 ? (points.length - 1) / duration_s : 0,
    frozen_count: points.filter((p) => p.flags.includes('frozen')).length,
    spike_count: points.filter((p) => p.flags.includes('spike')).length,
    gap_count: points.filter((p) => p.flags.includes('gap')).length,
    peak_raw_accel_ms2,
    trim_index,
    median_gap_ms: medianDtMs,
    gap_ceiling_ms: gapCeilingMs,
  };
}

function medianGap(sorted: RawSpeedSample[]): number {
  if (sorted.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].t_ms - sorted[i - 1].t_ms);
  gaps.sort((a, b) => a - b);
  const mid = gaps.length >> 1;
  return gaps.length % 2 === 1 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/** Acceleration expressed in g, for read-outs where m/s² means nothing to a rider. */
export function accelInG(accel_ms2: number): number {
  return accel_ms2 / GRAVITY_M_S2;
}
