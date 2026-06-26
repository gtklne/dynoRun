import type { RpmPoint } from '@/shared/types';
import type { AccelTimes } from './accel-times';
import type { RunQuality } from './run-quality';
import type { PowerBreakdownPoint } from './rpm-bin';

// Whether the grade angle is backed by usable GPS altitude or fell back to 0.
export type GradeSource = 'gps' | 'unavailable';

// The road-load assumptions that produced a curve, surfaced to the expert view.
// In-memory only (lives on AnalyzedRun); not persisted.
export interface RoadLoadSummary {
  cd_a_m2: number;
  cd_a_source: 'vehicle' | 'default';
  crr: number;
  crr_source: 'default';
  air_density_kg_m3: number;
  mass_kg: number;
  grade_rad: number; // signed; 0 when flat OR unavailable
  grade_pct: number; // tan(grade_rad)*100, signed
  grade_source: GradeSource;
}

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
  // Road-load decomposition for the expert view. Parallel to `points` (same RPM
  // bins). In-memory only — not part of the persisted DerivedCurve.
  breakdown: PowerBreakdownPoint[];
  road_load: RoadLoadSummary;
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
