import { describe, it, expect } from 'vitest';
import { computeCurveDelta } from '@/analysis/curve-delta';
import type { RpmPoint } from '@/shared/types';

function pt(rpm: number, power: number, torque = 0): RpmPoint {
  return { rpm, wheel_power_kw: power, wheel_torque_nm: torque };
}

describe('computeCurveDelta', () => {
  it('returns empty when both inputs are empty', () => {
    expect(computeCurveDelta([], [])).toEqual([]);
  });

  it('returns empty when only one input is empty', () => {
    expect(computeCurveDelta([pt(2000, 10)], [])).toEqual([]);
    expect(computeCurveDelta([], [pt(2000, 10)])).toEqual([]);
  });

  it('returns all-zero deltas for identical curves', () => {
    const curve: RpmPoint[] = [
      pt(2050, 10, 47),
      pt(2150, 20, 88),
      pt(2250, 30, 127),
    ];
    const out = computeCurveDelta(curve, curve);
    expect(out).toHaveLength(3);
    for (const d of out) {
      expect(d.delta_power_kw).toBe(0);
      expect(d.delta_torque_nm).toBe(0);
    }
  });

  it('returns positive deltas when A is uniformly higher than B', () => {
    const a: RpmPoint[] = [pt(2050, 30, 140), pt(2150, 50, 220)];
    const b: RpmPoint[] = [pt(2050, 10, 47), pt(2150, 20, 88)];
    const out = computeCurveDelta(a, b);
    expect(out).toHaveLength(2);
    expect(out[0].delta_power_kw).toBe(20);
    expect(out[0].delta_torque_nm).toBe(93);
    expect(out[1].delta_power_kw).toBe(30);
    expect(out[1].delta_torque_nm).toBe(132);
    expect(out[0].a_power_kw).toBe(30);
    expect(out[0].b_power_kw).toBe(10);
  });

  it('returns negative deltas when A is uniformly lower than B', () => {
    const a: RpmPoint[] = [pt(2050, 10), pt(2150, 20)];
    const b: RpmPoint[] = [pt(2050, 25), pt(2150, 45)];
    const out = computeCurveDelta(a, b);
    expect(out[0].delta_power_kw).toBe(-15);
    expect(out[1].delta_power_kw).toBe(-25);
  });

  it('outputs only the RPM intersection when the curves have different ranges', () => {
    const a: RpmPoint[] = [pt(2050, 10), pt(2150, 20), pt(2250, 30)];
    const b: RpmPoint[] = [pt(2150, 5), pt(2250, 5), pt(2350, 5)];
    const out = computeCurveDelta(a, b);
    expect(out.map((d) => d.rpm)).toEqual([2150, 2250]);
    expect(out.map((d) => d.delta_power_kw)).toEqual([15, 25]);
  });

  it('skips mismatched RPM bins when sparseness differs between curves', () => {
    const a: RpmPoint[] = [pt(2050, 10), pt(2150, 20), pt(2350, 40)];
    const b: RpmPoint[] = [pt(2050, 5), pt(2250, 30), pt(2350, 35)];
    const out = computeCurveDelta(a, b);
    expect(out.map((d) => d.rpm)).toEqual([2050, 2350]);
    expect(out.map((d) => d.delta_power_kw)).toEqual([5, 5]);
  });

  it('returns points sorted by RPM ascending even when inputs are unsorted', () => {
    const a: RpmPoint[] = [pt(2350, 30), pt(2050, 10), pt(2150, 20)];
    const b: RpmPoint[] = [pt(2150, 5), pt(2350, 25), pt(2050, 8)];
    const out = computeCurveDelta(a, b);
    expect(out.map((d) => d.rpm)).toEqual([2050, 2150, 2350]);
  });
});
