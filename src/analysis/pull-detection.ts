import type { RawSpeedSample } from './types';
import { resample } from './resample';
import { smoothSavitzkyGolay } from './smooth';
import { differentiate } from './differentiate';
import { kmhToMps } from '@/shared/units';

/**
 * A candidate acceleration pull found inside a long hands-free recording.
 * Times are in the recording's own t_ms domain (relative to sensor start).
 */
export interface DetectedPull {
  t_start_ms: number;
  t_end_ms: number;
  duration_ms: number;
  v_start_mps: number;
  v_peak_mps: number;
  speed_gain_mps: number;
}

export interface PullDetectionConfig {
  resample_step_ms: number;
  smooth_window: number;
  /** Sustained acceleration above this marks a candidate region. */
  accel_threshold_ms2: number;
  /** Sub-threshold gaps shorter than this merge adjacent regions (spans a quick upshift). */
  merge_gap_ms: number;
  min_duration_ms: number;
  /** Reject implausibly long "pulls" (GPS drift, long gentle cruising). */
  max_duration_ms: number;
  min_speed_gain_kmh: number;
  min_peak_speed_kmh: number;
}

export const DEFAULT_PULL_DETECTION_CONFIG: PullDetectionConfig = {
  resample_step_ms: 200,
  smooth_window: 9,
  accel_threshold_ms2: 0.3,
  merge_gap_ms: 1200,
  min_duration_ms: 3000,
  max_duration_ms: 120_000,
  min_speed_gain_kmh: 15,
  min_peak_speed_kmh: 30,
};

interface Region { start: number; end: number } // inclusive indices into the resampled grid

/**
 * Find acceleration pulls in a whole-ride recording: resample + smooth the
 * speed trace, mark sustained-acceleration regions, merge across brief dips
 * (gear shifts), then extend each region back to its local speed minimum and
 * forward to its local peak. Pure; returns pulls in chronological order.
 */
export function detectPulls(
  samples: RawSpeedSample[],
  config: Partial<PullDetectionConfig> = {},
): DetectedPull[] {
  const cfg = { ...DEFAULT_PULL_DETECTION_CONFIG, ...config };
  if (samples.length < 2) return [];

  const grid = differentiate(smoothSavitzkyGolay(resample(samples, cfg.resample_step_ms), cfg.smooth_window));
  if (grid.length < 2) return [];

  const accelerating = grid.map((s) => s.accel_ms2 >= cfg.accel_threshold_ms2);
  const regions = mergeRegions(findRegions(accelerating), grid, cfg.merge_gap_ms);

  const pulls: DetectedPull[] = [];
  for (const region of regions) {
    // Don't let backward extension reach into the previous pull.
    const floor = pulls.length > 0
      ? grid.findIndex((s) => s.t_ms > pulls[pulls.length - 1].t_end_ms)
      : 0;
    const start = extendBackToLocalMin(grid, region.start, Math.max(0, floor));
    const end = extendForwardToPeak(grid, region.end);

    const v_start = grid[start].speed_mps;
    const v_peak = grid[end].speed_mps;
    const duration = grid[end].t_ms - grid[start].t_ms;
    const gain = v_peak - v_start;

    if (duration < cfg.min_duration_ms || duration > cfg.max_duration_ms) continue;
    if (gain < kmhToMps(cfg.min_speed_gain_kmh)) continue;
    if (v_peak < kmhToMps(cfg.min_peak_speed_kmh)) continue;

    pulls.push({
      t_start_ms: grid[start].t_ms,
      t_end_ms: grid[end].t_ms,
      duration_ms: duration,
      v_start_mps: v_start,
      v_peak_mps: v_peak,
      speed_gain_mps: gain,
    });
  }
  return pulls;
}

/**
 * Raw samples belonging to a pull, with t_ms rebased to 0 so the slice looks
 * like a standalone run to the analysis pipeline.
 */
export function slicePullSamples(samples: RawSpeedSample[], pull: DetectedPull): RawSpeedSample[] {
  const slice = samples.filter((s) => s.t_ms >= pull.t_start_ms && s.t_ms <= pull.t_end_ms);
  if (slice.length === 0) return [];
  // Pull boundaries live on the detection grid, which need not coincide with a
  // raw sample time — rebase to the first included sample so t starts at 0.
  const t0 = slice[0].t_ms;
  return slice.map((s) => ({ ...s, t_ms: s.t_ms - t0 }));
}

function findRegions(mask: boolean[]): Region[] {
  const regions: Region[] = [];
  let start = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && start === -1) start = i;
    if (!mask[i] && start !== -1) {
      regions.push({ start, end: i - 1 });
      start = -1;
    }
  }
  if (start !== -1) regions.push({ start, end: mask.length - 1 });
  return regions;
}

function mergeRegions(regions: Region[], grid: { t_ms: number }[], gap_ms: number): Region[] {
  const merged: Region[] = [];
  for (const r of regions) {
    const prev = merged[merged.length - 1];
    if (prev && grid[r.start].t_ms - grid[prev.end].t_ms <= gap_ms) {
      prev.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

// Walk back down the strictly-decreasing slope to the local speed minimum where
// the pull actually began. Strict comparison so a flat standstill (speeds all
// ~equal) doesn't drag the start into minutes of idling; stop early near zero.
function extendBackToLocalMin(grid: { speed_mps: number }[], start: number, floor: number): number {
  let i = start;
  while (i > floor && grid[i].speed_mps > 0.5 && grid[i - 1].speed_mps < grid[i].speed_mps) i--;
  return i;
}

function extendForwardToPeak(grid: { speed_mps: number }[], end: number): number {
  let i = end;
  while (i < grid.length - 1 && grid[i + 1].speed_mps > grid[i].speed_mps) i++;
  return i;
}
