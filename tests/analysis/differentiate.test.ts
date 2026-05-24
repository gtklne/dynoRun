import { describe, it, expect } from 'vitest';
import { differentiate } from '@/analysis/differentiate';

describe('differentiate', () => {
  it('returns constant acceleration for linear speed', () => {
    const input = Array.from({ length: 11 }, (_, i) => ({
      t_ms: i * 1000,
      speed_mps: 10 + i,
    }));
    const out = differentiate(input);
    for (let i = 1; i < out.length - 1; i++) {
      expect(out[i].accel_ms2).toBeCloseTo(1, 6);
    }
  });

  it('returns zero acceleration for a single sample', () => {
    const out = differentiate([{ t_ms: 0, speed_mps: 5 }]);
    expect(out).toEqual([{ t_ms: 0, speed_mps: 5, accel_ms2: 0 }]);
  });

  it('returns empty for empty input', () => {
    expect(differentiate([])).toEqual([]);
  });

  it('uses forward/backward at edges', () => {
    const input = [
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 1000, speed_mps: 1 },
      { t_ms: 2000, speed_mps: 4 },
    ];
    const out = differentiate(input);
    expect(out[0].accel_ms2).toBeCloseTo(1, 6);
    expect(out[2].accel_ms2).toBeCloseTo(3, 6);
  });
});
