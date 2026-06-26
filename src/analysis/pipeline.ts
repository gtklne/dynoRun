import type { AnalyzedRun, RawSpeedSample } from './types';
import { PIPELINE_VERSION } from './types';
import { trimToAccelPhase } from './trim-to-peak';
import { resample } from './resample';
import { smoothSavitzkyGolay } from './smooth';
import { differentiate } from './differentiate';
import { powerAndTorque } from './power-torque';
import { binByRpm, binBreakdownByRpm } from './rpm-bin';
import { computeAccelTimes } from './accel-times';
import { computeRunQuality } from './run-quality';
import { computeGradeRad, computeGradeSource } from './grade';
import { resolveRoadLoad } from './road-load-defaults';
import type { VehicleKind } from '@/shared/types';

export interface AnalyzeInput {
  samples: RawSpeedSample[];
  mass_kg: number;
  rollout_m_per_rev: number;
  // Road-load inputs. Omitted (e.g. synthetic demo/fixture data) → 'car'
  // defaults and no grade, so the pipeline still produces a valid curve.
  kind?: VehicleKind;
  drag_coefficient?: number | null;
  frontal_area_m2?: number | null;
  resample_step_ms?: number;
  smooth_window?: number;
  bin_width_rpm?: number;
}

export function analyzeRun(input: AnalyzeInput): AnalyzedRun {
  const step = input.resample_step_ms ?? 100;
  const window = input.smooth_window ?? 11;
  const bin = input.bin_width_rpm ?? 100;

  const trimmed = trimToAccelPhase(input.samples);
  const resampled = resample(trimmed, step);
  const smoothed = smoothSavitzkyGolay(resampled, window);
  const differentiated = differentiate(smoothed);

  // Grade is a single average angle for the pull, derived from altitude over the
  // accel phase (the stretch the power is measured on). CdA/Crr come from the
  // vehicle or kind defaults.
  const grade_rad = computeGradeRad(trimmed);
  const grade_source = computeGradeSource(trimmed);
  const roadLoad = resolveRoadLoad(
    input.kind ?? 'car',
    input.drag_coefficient,
    input.frontal_area_m2,
  );
  const ptPoints = powerAndTorque(differentiated, input.mass_kg, input.rollout_m_per_rev, {
    cd_a_m2: roadLoad.cd_a_m2,
    crr: roadLoad.crr,
    grade_rad,
    air_density_kg_m3: roadLoad.air_density_kg_m3,
  });
  const points = binByRpm(ptPoints, bin);
  const breakdown = binBreakdownByRpm(ptPoints, bin);

  const accel_times = computeAccelTimes(smoothed);
  const quality = computeRunQuality({ raw: trimmed, smoothed, differentiated });

  const rpms = points.map((p) => p.rpm);
  return {
    rpm_min: rpms.length ? Math.min(...rpms) : 0,
    rpm_max: rpms.length ? Math.max(...rpms) : 0,
    points,
    pipeline_version: PIPELINE_VERSION,
    accel_times,
    quality,
    breakdown,
    road_load: {
      cd_a_m2: roadLoad.cd_a_m2,
      cd_a_source: roadLoad.cd_a_source,
      crr: roadLoad.crr,
      crr_source: roadLoad.crr_source,
      air_density_kg_m3: roadLoad.air_density_kg_m3,
      mass_kg: input.mass_kg,
      grade_rad,
      grade_pct: Math.tan(grade_rad) * 100,
      grade_source,
    },
  };
}
