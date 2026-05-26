import type { RpmPoint } from '@/shared/types';

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
}

// v2: trim raw samples to peak-speed before resampling so the coast-down
// no longer pollutes the RPM bins with negative power.
export const PIPELINE_VERSION = 2;
