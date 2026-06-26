import { describe, it, expect } from 'vitest';
import { powerAndTorque } from '@/analysis/power-torque';

describe('powerAndTorque', () => {
  it('computes power = F*v and torque = P/omega', () => {
    const out = powerAndTorque(
      [{ t_ms: 0, speed_mps: 10, accel_ms2: 2 }],
      1000,
      0.5,
    );
    expect(out[0].rpm).toBeCloseTo(1200, 2);
    expect(out[0].wheel_power_kw).toBeCloseTo(20, 3);
    expect(out[0].wheel_torque_nm).toBeCloseTo(159.15, 1);
  });

  it('drops samples with non-positive speed (torque undefined at 0 rpm)', () => {
    const out = powerAndTorque(
      [
        { t_ms: 0, speed_mps: 0, accel_ms2: 1 },
        { t_ms: 100, speed_mps: 1, accel_ms2: 1 },
      ],
      1000,
      0.5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].t_ms).toBe(100);
  });

  it('adds aerodynamic drag, rolling resistance and grade to the inertial force', () => {
    const sample = { t_ms: 0, speed_mps: 10, accel_ms2: 2 };
    const baseline = powerAndTorque([sample], 1000, 0.5)[0];
    const withLoad = powerAndTorque([sample], 1000, 0.5, {
      cd_a_m2: 0.7,
      crr: 0.011,
      grade_rad: 0,
      air_density_kg_m3: 1.225,
    })[0];

    // F = m·a + ½ρ·CdA·v² + Crr·m·g
    const expectedForce = 1000 * 2 + 0.5 * 1.225 * 0.7 * 100 + 0.011 * 1000 * 9.81;
    expect(withLoad.wheel_power_kw).toBeCloseTo((expectedForce * 10) / 1000, 3);
    expect(withLoad.wheel_power_kw).toBeGreaterThan(baseline.wheel_power_kw);
  });

  it('uphill grade adds m·g·sin(θ); downhill subtracts it', () => {
    const sample = { t_ms: 0, speed_mps: 10, accel_ms2: 2 };
    const flat = powerAndTorque([sample], 1000, 0.5, { cd_a_m2: 0, crr: 0, grade_rad: 0 })[0];
    const up = powerAndTorque([sample], 1000, 0.5, { cd_a_m2: 0, crr: 0, grade_rad: 0.1 })[0];
    const down = powerAndTorque([sample], 1000, 0.5, { cd_a_m2: 0, crr: 0, grade_rad: -0.1 })[0];

    const gradeForce = 1000 * 9.81 * Math.sin(0.1);
    expect(up.wheel_power_kw).toBeCloseTo(flat.wheel_power_kw + (gradeForce * 10) / 1000, 3);
    expect(down.wheel_power_kw).toBeCloseTo(flat.wheel_power_kw - (gradeForce * 10) / 1000, 3);
  });

  it('decomposes power into four components that sum to wheel_power_kw', () => {
    const out = powerAndTorque([{ t_ms: 0, speed_mps: 10, accel_ms2: 2 }], 1000, 0.5, {
      cd_a_m2: 0.7,
      crr: 0.011,
      grade_rad: 0.05,
      air_density_kg_m3: 1.225,
    })[0];
    const sum = out.p_inertia_kw + out.p_aero_kw + out.p_roll_kw + out.p_grade_kw;
    expect(sum).toBeCloseTo(out.wheel_power_kw, 9);
    // Each component matches its closed form × v / 1000.
    expect(out.p_inertia_kw).toBeCloseTo((1000 * 2 * 10) / 1000, 6);
    expect(out.p_aero_kw).toBeCloseTo((0.5 * 1.225 * 0.7 * 100 * 10) / 1000, 6);
    expect(out.p_roll_kw).toBeCloseTo((0.011 * 1000 * 9.81 * Math.cos(0.05) * 10) / 1000, 6);
    expect(out.p_grade_kw).toBeCloseTo((1000 * 9.81 * Math.sin(0.05) * 10) / 1000, 6);
  });

  it('reports a signed (negative) grade component downhill', () => {
    const out = powerAndTorque([{ t_ms: 0, speed_mps: 10, accel_ms2: 2 }], 1000, 0.5, {
      cd_a_m2: 0,
      crr: 0,
      grade_rad: -0.1,
    })[0];
    expect(out.p_grade_kw).toBeLessThan(0);
    expect(out.p_grade_kw).toBeCloseTo((1000 * 9.81 * Math.sin(-0.1) * 10) / 1000, 6);
  });

  it('zeroes road-load components when no road load is supplied', () => {
    const out = powerAndTorque([{ t_ms: 0, speed_mps: 10, accel_ms2: 2 }], 1000, 0.5)[0];
    expect(out.p_aero_kw).toBe(0);
    expect(out.p_roll_kw).toBe(0);
    expect(out.p_grade_kw).toBe(0);
    expect(out.p_inertia_kw).toBeCloseTo(out.wheel_power_kw, 9);
  });
});
