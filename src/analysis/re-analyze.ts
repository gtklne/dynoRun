import { PIPELINE_VERSION } from './types';
import { analyzeRun } from './pipeline';
import { runRepository } from '@/api/repositories/run-repository';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { sampleRepository } from '@/api/repositories/sample-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { nowIso } from '@/shared/iso-time';
import type { DerivedCurve } from '@/shared/types';

export async function reanalyzeRun(runId: string): Promise<DerivedCurve | null> {
  const run = await runRepository.get(runId);
  if (!run) return null;
  const calibration = await calibrationRepository.get(run.calibration_id);
  if (!calibration) return null;
  const [vehicle, samples] = await Promise.all([
    vehicleRepository.get(calibration.vehicle_id),
    sampleRepository.listByRun(runId),
  ]);
  if (!vehicle) return null;
  if (samples.length === 0) return null;
  const result = analyzeRun({
    samples: samples.map((s) => ({ t_ms: s.t_ms, speed_mps: s.speed_mps })),
    mass_kg: vehicle.mass_kg,
    rollout_m_per_rev: calibration.rollout_m_per_rev,
  });
  const curve: DerivedCurve = {
    run_id: runId,
    rpm_min: result.rpm_min,
    rpm_max: result.rpm_max,
    points: result.points,
    pipeline_version: result.pipeline_version,
    computed_at: nowIso(),
  };
  await derivedCurveRepository.upsert(curve);
  if (result.points.length > 0) {
    const peakPower = result.points.reduce(
      (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
      result.points[0],
    );
    const peakTorque = result.points.reduce(
      (best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best),
      result.points[0],
    );
    await runRepository.update(runId, {
      peak_power_kw: peakPower.wheel_power_kw,
      peak_torque_nm: peakTorque.wheel_torque_nm,
      peak_power_rpm: peakPower.rpm,
    });
  }
  return curve;
}

export async function ensureCurrentCurve(
  runId: string,
  current: DerivedCurve | null,
): Promise<DerivedCurve | null> {
  if (current && current.pipeline_version >= PIPELINE_VERSION) return current;
  return reanalyzeRun(runId);
}
