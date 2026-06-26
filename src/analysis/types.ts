import type { RpmPoint } from '@/shared/types';
import type { AccelTimes } from './accel-times';
import type { RunQuality } from './run-quality';

export interface RawSpeedSample {
  t_ms: number;
  speed_mps: number;
  // Optional GPS altitude, used only to derive an average road grade for the
  // road-load correction. Absent on synthetic/older samples → grade drops to 0.
  altitude_m?: number | null;
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
// v4: road-load corrections — wheel force now includes aerodynamic drag,
// rolling resistance, and grade (from GPS altitude) on top of m·a. Drivetrain
// loss and rotational inertia are intentionally excluded (we report wheel
// power, not crank). Bumped so v3 curves recompute via ensureCurrentCurve.
export const PIPELINE_VERSION = 4;
