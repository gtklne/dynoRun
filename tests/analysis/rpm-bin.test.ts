import { describe, it, expect } from 'vitest';
import { binByRpm } from '@/analysis/rpm-bin';

describe('binByRpm', () => {
  it('averages points falling in the same bin', () => {
    const points = [
      { t_ms: 0, rpm: 2050, wheel_power_kw: 10, wheel_torque_nm: 50 },
      { t_ms: 100, rpm: 2080, wheel_power_kw: 20, wheel_torque_nm: 60 },
      { t_ms: 200, rpm: 2200, wheel_power_kw: 30, wheel_torque_nm: 70 },
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
