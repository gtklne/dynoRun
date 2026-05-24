import { describe, it, expect } from 'vitest';
import { speedToRpm } from '@/analysis/rpm-from-speed';

describe('speedToRpm', () => {
  it('computes rpm from speed and rollout', () => {
    expect(speedToRpm(10, 0.5)).toBeCloseTo(1200);
  });

  it('returns 0 for zero speed', () => {
    expect(speedToRpm(0, 0.5)).toBe(0);
  });
});
