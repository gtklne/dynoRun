import { describe, it, expect } from 'vitest';
import { binByRpm, binBreakdownByRpm } from '@/analysis/rpm-bin';
import type { PowerTorquePoint } from '@/analysis/power-torque';

// Build a PowerTorquePoint whose four components sum to wheel_power_kw, as the
// real pipeline guarantees. Components default to an even split of the total.
function pt(
  partial: Partial<PowerTorquePoint> & { rpm: number; wheel_power_kw: number },
): PowerTorquePoint {
  const q = partial.wheel_power_kw / 4;
  return {
    t_ms: partial.t_ms ?? 0,
    rpm: partial.rpm,
    wheel_power_kw: partial.wheel_power_kw,
    wheel_torque_nm: partial.wheel_torque_nm ?? 0,
    p_inertia_kw: partial.p_inertia_kw ?? q,
    p_aero_kw: partial.p_aero_kw ?? q,
    p_roll_kw: partial.p_roll_kw ?? q,
    p_grade_kw: partial.p_grade_kw ?? q,
  };
}

describe('binByRpm', () => {
  it('averages points falling in the same bin', () => {
    const points = [
      pt({ t_ms: 0, rpm: 2050, wheel_power_kw: 10, wheel_torque_nm: 50 }),
      pt({ t_ms: 100, rpm: 2080, wheel_power_kw: 20, wheel_torque_nm: 60 }),
      pt({ t_ms: 200, rpm: 2200, wheel_power_kw: 30, wheel_torque_nm: 70 }),
    ];
    const out = binByRpm(points, 100);
    expect(out).toEqual([
      { rpm: 2050, wheel_power_kw: 15, wheel_torque_nm: 55 },
      { rpm: 2250, wheel_power_kw: 30, wheel_torque_nm: 70 },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(binByRpm([], 100)).toEqual([]);
  });
});

describe('binBreakdownByRpm', () => {
  it('returns empty for empty input', () => {
    expect(binBreakdownByRpm([], 100)).toEqual([]);
  });

  it('averages each component per bin and total_kw equals their sum', () => {
    const points = [
      pt({ rpm: 2050, wheel_power_kw: 12, p_inertia_kw: 6, p_aero_kw: 3, p_roll_kw: 2, p_grade_kw: 1 }),
      pt({ rpm: 2090, wheel_power_kw: 20, p_inertia_kw: 12, p_aero_kw: 4, p_roll_kw: 3, p_grade_kw: 1 }),
    ];
    const [bin] = binBreakdownByRpm(points, 100);
    expect(bin.rpm).toBe(2050);
    expect(bin.p_inertia_kw).toBeCloseTo(9, 6);
    expect(bin.p_aero_kw).toBeCloseTo(3.5, 6);
    expect(bin.p_roll_kw).toBeCloseTo(2.5, 6);
    expect(bin.p_grade_kw).toBeCloseTo(1, 6);
    expect(bin.total_kw).toBeCloseTo(16, 6);
  });

  it('reconciles with binByRpm: total_kw === wheel_power_kw per bin', () => {
    const points = [
      pt({ rpm: 2050, wheel_power_kw: 12, p_inertia_kw: 6, p_aero_kw: 3, p_roll_kw: 2, p_grade_kw: 1 }),
      pt({ rpm: 2090, wheel_power_kw: 20, p_inertia_kw: 12, p_aero_kw: 4, p_roll_kw: 3, p_grade_kw: 1 }),
      pt({ rpm: 2240, wheel_power_kw: 30, p_inertia_kw: 20, p_aero_kw: 6, p_roll_kw: 3, p_grade_kw: 1 }),
    ];
    const totals = binByRpm(points, 100);
    const breakdown = binBreakdownByRpm(points, 100);
    expect(breakdown.length).toBe(totals.length);
    breakdown.forEach((b, i) => {
      expect(b.rpm).toBe(totals[i].rpm);
      expect(b.total_kw).toBeCloseTo(totals[i].wheel_power_kw, 6);
      expect(b.p_inertia_kw + b.p_aero_kw + b.p_roll_kw + b.p_grade_kw).toBeCloseTo(b.total_kw, 6);
    });
  });

  it('preserves a signed (negative) grade component through binning', () => {
    const points = [
      pt({ rpm: 3010, wheel_power_kw: 10, p_inertia_kw: 9, p_aero_kw: 3, p_roll_kw: 1, p_grade_kw: -3 }),
    ];
    const [bin] = binBreakdownByRpm(points, 100);
    expect(bin.p_grade_kw).toBeCloseTo(-3, 6);
    expect(bin.total_kw).toBeCloseTo(10, 6);
  });
});
