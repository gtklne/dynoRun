import { describe, it, expect } from 'vitest';
import { AutoStopDetector } from '@/run/auto-stop-detector';

describe('AutoStopDetector', () => {
  it('does not fire on empty or single-sample buffer', () => {
    const d = new AutoStopDetector({ zero_accel_window_ms: 1000 });
    expect(d.check(0)).toBe(false);
    d.push({ t_ms: 0, speed_mps: 5 });
    expect(d.check(0)).toBe(false);
  });

  it('does not fire while speed is increasing', () => {
    const d = new AutoStopDetector({ zero_accel_window_ms: 1000 });
    d.push({ t_ms: 0, speed_mps: 1 });
    d.push({ t_ms: 1000, speed_mps: 2 });
    d.push({ t_ms: 2000, speed_mps: 3 });
    expect(d.check(2000)).toBe(false);
  });

  it('fires when two consecutive 1Hz samples show non-increasing speed', () => {
    // Simulates the prod failure: 1Hz GPS where prev sample is ~1000ms before
    // the current one. The old "span >= window" check missed this.
    const d = new AutoStopDetector({ zero_accel_window_ms: 1000 });
    d.push({ t_ms: 0, speed_mps: 2 });
    d.push({ t_ms: 1003, speed_mps: 4 });
    d.push({ t_ms: 1998, speed_mps: 5.89 });
    expect(d.check(1998)).toBe(false);
    d.push({ t_ms: 3001, speed_mps: 5.85 });
    expect(d.check(3001)).toBe(true);
  });

  it('tolerates GPS jitter slightly below the nominal window', () => {
    const d = new AutoStopDetector({ zero_accel_window_ms: 1000 });
    d.push({ t_ms: 0, speed_mps: 5 });
    d.push({ t_ms: 850, speed_mps: 5 });
    expect(d.check(850)).toBe(true);
  });

  it('does not fire when the only earlier sample is too recent', () => {
    const d = new AutoStopDetector({ zero_accel_window_ms: 1000 });
    d.push({ t_ms: 0, speed_mps: 5 });
    d.push({ t_ms: 500, speed_mps: 4 });
    expect(d.check(500)).toBe(false);
  });

  it('reset clears the buffer', () => {
    const d = new AutoStopDetector({ zero_accel_window_ms: 1000 });
    d.push({ t_ms: 0, speed_mps: 5 });
    d.push({ t_ms: 1000, speed_mps: 4 });
    d.reset();
    expect(d.check(1000)).toBe(false);
  });
});
