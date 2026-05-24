import { describe, it, expect } from 'vitest';
import { AutoStopDetector } from '@/run/auto-stop-detector';

describe('AutoStopDetector', () => {
  it('does not fire while speed is increasing', () => {
    const det = new AutoStopDetector({ zero_accel_window_ms: 500 });
    det.push({ t_ms: 0, speed_mps: 10 });
    det.push({ t_ms: 100, speed_mps: 12 });
    det.push({ t_ms: 200, speed_mps: 14 });
    expect(det.check(200)).toBe(false);
  });

  it('fires after 500ms of non-positive acceleration', () => {
    const det = new AutoStopDetector({ zero_accel_window_ms: 500 });
    det.push({ t_ms: 0, speed_mps: 20 });
    det.push({ t_ms: 100, speed_mps: 25 });   // accelerating
    det.push({ t_ms: 200, speed_mps: 28 });   // accelerating
    det.push({ t_ms: 300, speed_mps: 28 });   // lift
    det.push({ t_ms: 500, speed_mps: 28 });
    det.push({ t_ms: 800, speed_mps: 27 });
    expect(det.check(800)).toBe(true);
  });

  it('resets if speed climbs again', () => {
    const det = new AutoStopDetector({ zero_accel_window_ms: 500 });
    det.push({ t_ms: 0, speed_mps: 20 });
    det.push({ t_ms: 200, speed_mps: 20 });
    det.push({ t_ms: 400, speed_mps: 22 });
    det.push({ t_ms: 600, speed_mps: 24 });
    expect(det.check(600)).toBe(false);
  });
});
