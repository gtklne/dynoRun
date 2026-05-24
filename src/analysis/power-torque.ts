import type { DifferentiatedSample } from './types';
import { speedToRpm } from './rpm-from-speed';
import { rpmToRadPerSec } from '@/shared/units';

export interface PowerTorquePoint {
  t_ms: number;
  rpm: number;
  wheel_power_kw: number;
  wheel_torque_nm: number;
}

export function powerAndTorque(
  input: DifferentiatedSample[],
  mass_kg: number,
  rollout_m_per_rev: number,
): PowerTorquePoint[] {
  const out: PowerTorquePoint[] = [];
  for (const s of input) {
    if (s.speed_mps <= 0) continue;
    const force_n = mass_kg * s.accel_ms2;
    const power_w = force_n * s.speed_mps;
    const rpm = speedToRpm(s.speed_mps, rollout_m_per_rev);
    const omega = rpmToRadPerSec(rpm);
    const torque_nm = omega > 0 ? power_w / omega : 0;
    out.push({
      t_ms: s.t_ms,
      rpm,
      wheel_power_kw: power_w / 1000,
      wheel_torque_nm: torque_nm,
    });
  }
  return out;
}
