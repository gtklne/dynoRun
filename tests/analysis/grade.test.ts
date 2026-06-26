import { describe, it, expect } from 'vitest';
import { computeGradeRad, computeGradeSource } from '@/analysis/grade';
import type { RawSpeedSample } from '@/analysis/types';

// Constant 10 m/s over 2 s → trapezoid distance = 20 m.
function constantSpeedSamples(altitudes: Array<number | null>): RawSpeedSample[] {
  return altitudes.map((alt, i) => ({
    t_ms: i * 1000,
    speed_mps: 10,
    altitude_m: alt,
  }));
}

describe('computeGradeRad', () => {
  it('returns 0 on flat ground', () => {
    expect(computeGradeRad(constantSpeedSamples([100, 100, 100]))).toBe(0);
  });

  it('returns a positive angle uphill (net alt / path distance)', () => {
    // +2 m over 20 m → atan(0.1)
    const grade = computeGradeRad(constantSpeedSamples([0, 1, 2]));
    expect(grade).toBeCloseTo(Math.atan(2 / 20), 6);
  });

  it('returns a negative angle downhill', () => {
    const grade = computeGradeRad(constantSpeedSamples([2, 1, 0]));
    expect(grade).toBeCloseTo(Math.atan(-2 / 20), 6);
  });

  it('returns 0 when altitude is unavailable', () => {
    expect(computeGradeRad(constantSpeedSamples([null, null, null]))).toBe(0);
  });

  it('returns 0 with fewer than two samples', () => {
    expect(computeGradeRad([{ t_ms: 0, speed_mps: 10, altitude_m: 5 }])).toBe(0);
  });

  it('rejects impossible altitude deltas (|Δalt| ≥ path distance)', () => {
    // 50 m rise over 20 m of travel is physically impossible → bad GPS alt → 0.
    expect(computeGradeRad(constantSpeedSamples([0, 25, 50]))).toBe(0);
  });
});

describe('computeGradeSource', () => {
  it("returns 'gps' when usable altitude is present (even on a flat road)", () => {
    expect(computeGradeSource(constantSpeedSamples([100, 100, 100]))).toBe('gps');
    expect(computeGradeSource(constantSpeedSamples([0, 1, 2]))).toBe('gps');
  });

  it("returns 'unavailable' when altitude is missing", () => {
    expect(computeGradeSource(constantSpeedSamples([null, null, null]))).toBe('unavailable');
  });

  it("returns 'unavailable' with fewer than two samples", () => {
    expect(computeGradeSource([{ t_ms: 0, speed_mps: 10, altitude_m: 5 }])).toBe('unavailable');
  });

  it("returns 'unavailable' for impossible altitude deltas (bad GPS, not 'flat')", () => {
    expect(computeGradeSource(constantSpeedSamples([0, 25, 50]))).toBe('unavailable');
  });
});
