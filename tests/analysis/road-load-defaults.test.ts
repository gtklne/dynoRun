import { describe, it, expect } from 'vitest';
import { resolveRoadLoad } from '@/analysis/road-load-defaults';

describe('resolveRoadLoad', () => {
  it("uses the vehicle's own Cd×A and reports source 'vehicle' when both are present", () => {
    const r = resolveRoadLoad('car', 0.30, 2.2);
    expect(r.cd_a_m2).toBeCloseTo(0.66, 6);
    expect(r.cd_a_source).toBe('vehicle');
  });

  it("falls back to kind defaults and reports source 'default' when aero is missing", () => {
    expect(resolveRoadLoad('car', null, 2.2).cd_a_source).toBe('default');
    expect(resolveRoadLoad('car', 0.30, null).cd_a_source).toBe('default');
    const car = resolveRoadLoad('car', null, null);
    expect(car.cd_a_m2).toBeCloseTo(0.70, 6);
    expect(car.cd_a_source).toBe('default');
  });

  it('applies kind-specific defaults and always marks Crr as default', () => {
    const moto = resolveRoadLoad('motorcycle', null, null);
    expect(moto.cd_a_m2).toBeCloseTo(0.55, 6);
    expect(moto.crr).toBeCloseTo(0.016, 6);
    expect(moto.crr_source).toBe('default');
    expect(resolveRoadLoad('car', 0.30, 2.2).crr_source).toBe('default');
  });
});
