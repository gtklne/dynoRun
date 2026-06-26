import type { DifferentiatedSample } from './types';
import { speedToRpm } from './rpm-from-speed';
import { rpmToRadPerSec } from '@/shared/units';
import { AIR_DENSITY_KG_M3, GRAVITY_M_S2 } from './road-load-defaults';

export interface PowerTorquePoint {
  t_ms: number;
  rpm: number;
  wheel_power_kw: number;
  wheel_torque_nm: number;
}

// Road-load terms added to the inertial force. When omitted, powerAndTorque is
// pure F = m·a (the historical behaviour). grade_rad is a single average angle
// for the whole pull (see grade.ts).
export interface RoadLoad {
  cd_a_m2: number;
  crr: number;
  grade_rad: number;
  air_density_kg_m3?: number;
}

export function powerAndTorque(
  input: DifferentiatedSample[],
  mass_kg: number,
  rollout_m_per_rev: number,
  roadLoad?: RoadLoad,
): PowerTorquePoint[] {
  const cd_a = roadLoad?.cd_a_m2 ?? 0;
  const crr = roadLoad?.crr ?? 0;
  const grade_rad = roadLoad?.grade_rad ?? 0;
  const rho = roadLoad?.air_density_kg_m3 ?? AIR_DENSITY_KG_M3;
  const f_roll = crr * mass_kg * GRAVITY_M_S2 * Math.cos(grade_rad);
  const f_grade = mass_kg * GRAVITY_M_S2 * Math.sin(grade_rad);

  const out: PowerTorquePoint[] = [];
  for (const s of input) {
    if (s.speed_mps <= 0) continue;
    const f_inertia = mass_kg * s.accel_ms2;
    const f_aero = 0.5 * rho * cd_a * s.speed_mps * s.speed_mps;
    const force_n = f_inertia + f_aero + f_roll + f_grade;
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
