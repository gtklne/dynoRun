import { describe, it, expect } from 'vitest';
import { kmhToMps, mpsToKmh, rpmToRadPerSec } from '@/shared/units';

describe('units', () => {
  it('converts km/h to m/s', () => {
    expect(kmhToMps(36)).toBeCloseTo(10);
  });
  it('converts m/s to km/h', () => {
    expect(mpsToKmh(10)).toBeCloseTo(36);
  });
  it('converts RPM to rad/s', () => {
    expect(rpmToRadPerSec(60)).toBeCloseTo(2 * Math.PI);
  });
});
