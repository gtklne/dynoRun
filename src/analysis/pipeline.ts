import type { AnalyzedRun, RawSpeedSample } from './types';
import { PIPELINE_VERSION } from './types';
import { trimToAccelPhase } from './trim-to-peak';
import { resample } from './resample';
import { smoothSavitzkyGolay } from './smooth';
import { differentiate } from './differentiate';
import { powerAndTorque } from './power-torque';
import { binByRpm } from './rpm-bin';

export interface AnalyzeInput {
  samples: RawSpeedSample[];
  mass_kg: number;
  rollout_m_per_rev: number;
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
  const ptPoints = powerAndTorque(differentiated, input.mass_kg, input.rollout_m_per_rev);
  const points = binByRpm(ptPoints, bin);

  const rpms = points.map((p) => p.rpm);
  return {
    rpm_min: rpms.length ? Math.min(...rpms) : 0,
    rpm_max: rpms.length ? Math.max(...rpms) : 0,
    points,
    pipeline_version: PIPELINE_VERSION,
  };
}
