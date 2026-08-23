import type { RawSpeedSample, SmoothedSample } from './types';
import { resample } from './resample';
import { smoothSavitzkyGolay } from './smooth';
import { kmhToMps, mpsToKmh } from '@/shared/units';

/**
 * A candidate steady-speed plateau found inside a long hands-free recording:
 * one of the moments the rider might have been holding a fixed RPM in a known
 * gear. Times are in the recording's own t_ms domain (relative to sensor start).
 */
export interface DetectedPlateau {
  t_start_ms: number;
  t_end_ms: number;
  duration_ms: number;
  mean_speed_kmh: number;
  /** max - min km/h across the raw samples in the window. */
  spread_kmh: number;
  /** higher = better calibration candidate */
  score: number;
  /** Raw fixes per second actually backing this window. */
  raw_coverage_hz: number;
  /** Raw samples inside the window. */
  raw_samples: number;
  /** Largest gap between consecutive raw fixes, window edges included. */
  max_raw_gap_ms: number;
}

export interface PlateauDetectionConfig {
  resample_step_ms: number;
  smooth_window: number;
  /** A window is steady while max-min stays within this. */
  max_spread_kmh: number;
  min_duration_ms: number;
  /** Excludes standstill and creeping; no real calibration point sits this low. */
  min_speed_kmh: number;
  /** Duration past this adds nothing to `score`. */
  score_duration_cap_ms: number;
  /** Candidates within this of a better-scoring one are the same hold. */
  dedupe_speed_kmh: number;
  max_candidates: number;
  /**
   * Minimum raw fixes per second inside a window. `resample` interpolates
   * straight through a GPS dropout, which fabricates a zero-spread plateau
   * that would otherwise score better than any real hold.
   */
  min_raw_coverage_hz: number;
  /**
   * Largest allowed gap between consecutive raw fixes inside a window (the
   * window edges count as bracketing fixes). The rate floor alone is blind to
   * any dropout shorter than half the window: 32 fixes across a 60 s stretch
   * with a 30 s hole in the middle still reads 0.53 Hz and passes, while those
   * 30 s of interpolated collinear points score a perfect 1.0. This is the
   * check that actually catches a fabricated plateau.
   */
  max_raw_gap_ms: number;
}

export const DEFAULT_PLATEAU_DETECTION_CONFIG: PlateauDetectionConfig = {
  resample_step_ms: 200,
  smooth_window: 9,
  max_spread_kmh: 1.5,
  min_duration_ms: 4000,
  min_speed_kmh: 20,
  score_duration_cap_ms: 15_000,
  dedupe_speed_kmh: 1.0,
  max_candidates: 8,
  // 1 Hz is the normal GPS cadence, so half of that is a generous floor that
  // only catches genuine dropouts.
  min_raw_coverage_hz: 0.5,
  // Four missed fixes at the normal 1 Hz cadence. Tolerates a bridge or a
  // moment of bad sky, decisively rejects a suspend/resume gap.
  max_raw_gap_ms: 4_000,
};

interface Window { start: number; end: number } // inclusive indices into the resampled grid

interface RawStats { count: number; sum: number; min: number; max: number; max_gap_ms: number }

/**
 * Find steady-speed plateaus in a whole-ride recording: resample + smooth the
 * speed trace, sweep it into maximal windows whose speed spread stays inside
 * `max_spread_kmh`, then re-measure each window against the raw samples it
 * covers and score it on how long, how tight and how well backed it was.
 * Pure; returns candidates best-first, NOT in chronological order.
 */
export function detectPlateaus(
  samples: RawSpeedSample[],
  config: Partial<PlateauDetectionConfig> = {},
): DetectedPlateau[] {
  const cfg = { ...DEFAULT_PLATEAU_DETECTION_CONFIG, ...config };
  if (samples.length < 2) return [];

  // `resample` sorts internally, so the grid is chronological whatever order the
  // recording arrives in; the raw re-measurement below walks a single forward
  // cursor and needs the same order.
  const raw = [...samples].sort((a, b) => a.t_ms - b.t_ms);
  const grid = smoothSavitzkyGolay(resample(raw, cfg.resample_step_ms), cfg.smooth_window);
  if (grid.length < 2) return [];

  const candidates: DetectedPlateau[] = [];
  let cursor = 0;
  for (const window of steadyWindows(grid, kmhToMps(cfg.max_spread_kmh))) {
    const t_start_ms = grid[window.start].t_ms;
    const t_end_ms = grid[window.end].t_ms;
    if (t_end_ms - t_start_ms < cfg.min_duration_ms) continue;
    while (cursor < raw.length && raw[cursor].t_ms < t_start_ms) cursor++;
    const plateau = measure(raw, cursor, t_start_ms, t_end_ms, cfg);
    if (plateau) candidates.push(plateau);
  }

  // Array.prototype.sort is stable, so equal-scoring candidates stay in the
  // chronological order the sweep produced them in.
  candidates.sort((a, b) => b.score - a.score);
  return dedupe(candidates, cfg.dedupe_speed_kmh).slice(0, cfg.max_candidates);
}

/**
 * Raw samples inside a plateau, with t_ms rebased to 0 so the slice can be
 * sparklined standalone.
 */
export function slicePlateauSamples(
  samples: RawSpeedSample[],
  plateau: DetectedPlateau,
): RawSpeedSample[] {
  const slice = samples.filter((s) => s.t_ms >= plateau.t_start_ms && s.t_ms <= plateau.t_end_ms);
  if (slice.length === 0) return [];
  // Plateau boundaries live on the detection grid, which need not coincide with
  // a raw sample time: rebase to the first included sample so t starts at 0.
  const t0 = slice[0].t_ms;
  return slice.map((s) => ({ ...s, t_ms: s.t_ms - t0 }));
}

// Maximal steady windows, in one forward sweep. Windows touch at a shared
// boundary sample and never otherwise overlap, so every sample belongs to at
// most one plateau.
function steadyWindows(grid: SmoothedSample[], maxSpread: number): Window[] {
  const windows: Window[] = [];
  let start = 0;
  let min = grid[0].speed_mps;
  let max = grid[0].speed_mps;

  for (let i = 1; i < grid.length; i++) {
    const v = grid[i].speed_mps;
    const lo = Math.min(min, v);
    const hi = Math.max(max, v);
    if (hi - lo <= maxSpread) {
      // Carried forward rather than re-scanning [start, i]: a whole ride is
      // ~90k grid points, and re-scanning would make the sweep quadratic.
      min = lo;
      max = hi;
      continue;
    }
    windows.push({ start, end: i - 1 });
    // The next plateau starts on the boundary sample this one ended on, unless
    // the step onto grid[i] is by itself wider than the spread: then the
    // boundary cannot belong to the next window either, and re-anchoring there
    // would emit the same one-sample window forever.
    start = Math.abs(v - grid[i - 1].speed_mps) <= maxSpread ? i - 1 : i;
    min = Math.min(grid[start].speed_mps, v);
    max = Math.max(grid[start].speed_mps, v);
  }
  windows.push({ start, end: grid.length - 1 });
  return windows;
}

/**
 * Score one located window against the RAW samples it covers, or reject it.
 *
 * The smoothed grid may only locate windows, never judge them: window 9 on a
 * 200 ms grid averages over 1.8 s, so it irons jittery cruising flat and
 * systematically under-reports spread, and `smooth.ts` leaves the first and
 * last m points untouched, which would make an edge plateau behave unlike an
 * interior one. Steadiness is therefore a raw-sample question. The live
 * detector answers it the same way, see `CalibrationStabilityDetector.check`.
 */
function measure(
  raw: RawSpeedSample[],
  from: number,
  t_start_ms: number,
  t_end_ms: number,
  cfg: PlateauDetectionConfig,
): DetectedPlateau | null {
  const duration_ms = t_end_ms - t_start_ms;
  const stats = rawStats(raw, from, t_start_ms, t_end_ms);
  if (stats.count === 0) return null;

  const raw_coverage_hz = duration_ms > 0 ? stats.count / (duration_ms / 1000) : 0;
  if (raw_coverage_hz < cfg.min_raw_coverage_hz) return null;
  if (stats.max_gap_ms > cfg.max_raw_gap_ms) return null;

  const spread_kmh = mpsToKmh(stats.max - stats.min);
  if (spread_kmh > cfg.max_spread_kmh) return null;

  const mean_kmh = mpsToKmh(stats.sum / stats.count);
  if (mean_kmh < cfg.min_speed_kmh) return null;

  // The duration cap is load-bearing: a 2-minute highway cruise must not
  // outrank a deliberate 15 s hold. Past the cap, only tightness separates
  // candidates.
  const held = Math.min(duration_ms, cfg.score_duration_cap_ms) / cfg.score_duration_cap_ms;
  const tightness = Math.max(0, 1 - spread_kmh / cfg.max_spread_kmh);

  return {
    t_start_ms,
    t_end_ms,
    duration_ms,
    mean_speed_kmh: mean_kmh,
    spread_kmh,
    score: held * tightness,
    raw_coverage_hz,
    raw_samples: stats.count,
    max_raw_gap_ms: stats.max_gap_ms,
  };
}

function rawStats(raw: RawSpeedSample[], from: number, t_start_ms: number, t_end_ms: number): RawStats {
  const stats: RawStats = { count: 0, sum: 0, min: Infinity, max: -Infinity, max_gap_ms: 0 };
  // The window edges bracket the run of fixes, so a window whose raw samples
  // all cluster at one end is caught as well as one with a hole in the middle.
  let prev_t = t_start_ms;
  for (let i = from; i < raw.length && raw[i].t_ms <= t_end_ms; i++) {
    const v = raw[i].speed_mps;
    stats.count++;
    stats.sum += v;
    if (v < stats.min) stats.min = v;
    if (v > stats.max) stats.max = v;
    stats.max_gap_ms = Math.max(stats.max_gap_ms, raw[i].t_ms - prev_t);
    prev_t = raw[i].t_ms;
  }
  stats.max_gap_ms = Math.max(stats.max_gap_ms, t_end_ms - prev_t);
  return stats;
}

// Walked best-first, so the survivor at a given speed is the best-scoring one
// and the rest are the same hold cut at slightly different boundaries (a brief
// wobble mid-hold splits one plateau into two windows at the same speed).
function dedupe(sorted: DetectedPlateau[], tolerance_kmh: number): DetectedPlateau[] {
  const kept: DetectedPlateau[] = [];
  for (const candidate of sorted) {
    const duplicate = kept.some(
      (k) => Math.abs(k.mean_speed_kmh - candidate.mean_speed_kmh) <= tolerance_kmh,
    );
    if (!duplicate) kept.push(candidate);
  }
  return kept;
}
