import type { RpmPoint } from '@/shared/types';
import type { AccelTimes } from './accel-times';
import type { RunQuality } from './run-quality';

export interface RawSpeedSample {
  t_ms: number;
  speed_mps: number;
}

export interface ResampledSample {
  t_ms: number;
  speed_mps: number;
}

export interface SmoothedSample {
  t_ms: number;
  speed_mps: number;
}

export interface DifferentiatedSample {
  t_ms: number;
  speed_mps: number;
  accel_ms2: number;
}

export interface AnalyzedRun {
  rpm_min: number;
  rpm_max: number;
  points: RpmPoint[];
  pipeline_version: number;
  accel_times: AccelTimes;
  quality: RunQuality;
}

// v2: trim raw samples to peak-speed before resampling so the coast-down
// no longer pollutes the RPM bins with negative power.
// v3: derive acceleration-time stats (0-100, quarter mile, etc.) and a run
// quality score from the same data so the review screen can surface them.
export const PIPELINE_VERSION = 3;
