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
});
