import { describe, it, expect } from 'vitest';
import { SensorRegistry } from '@/sensors/sensor-registry';
import { MockSpeedSource } from '@/sensors/mock-speed-source';

describe('SensorRegistry', () => {
  it('returns null when no source has the capability', () => {
    const reg = new SensorRegistry();
    expect(reg.best('rpm')).toBeNull();
  });

  it('returns the only source for that capability', () => {
    const reg = new SensorRegistry();
    const src = new MockSpeedSource('a', []);
    reg.register(src);
    expect(reg.best('speed')).toBe(src);
  });

  it('prefers higher-priority sources', () => {
    const reg = new SensorRegistry();
    const lo = new MockSpeedSource('lo', []);
    const hi = new MockSpeedSource('hi', []);
    reg.register(lo, 0);
    reg.register(hi, 10);
    expect(reg.best('speed')).toBe(hi);
  });
});
