import { describe, it, expect } from 'vitest';
import { CalibrationStabilityDetector } from '@/run/calibration-stability-detector';
import { mpsToKmh } from '@/shared/units';

describe('CalibrationStabilityDetector', () => {
  it('fires when speed stays within delta for the full window', () => {
    const det = new CalibrationStabilityDetector({ duration_ms: 1000, max_speed_delta_kmh: 1.0 });
    // 22.22 m/s ≈ 80 km/h, hold steady
    det.push({ t_ms: 0, speed_mps: 22.22 });
    det.push({ t_ms: 200, speed_mps: 22.30 });
    det.push({ t_ms: 400, speed_mps: 22.15 });
    det.push({ t_ms: 600, speed_mps: 22.22 });
    det.push({ t_ms: 800, speed_mps: 22.20 });
    expect(det.check(1000)).toBeNull();
    const result = det.check(1050);
    expect(result).not.toBeNull();
    expect(result!.captured_speed_kmh).toBeCloseTo(mpsToKmh(22.22), 0);
  });

  it('does not fire when speed deviates beyond delta', () => {
    const det = new CalibrationStabilityDetector({ duration_ms: 1000, max_speed_delta_kmh: 0.5 });
    det.push({ t_ms: 0, speed_mps: 22.22 });
    det.push({ t_ms: 500, speed_mps: 23.5 });  // way off
    det.push({ t_ms: 1100, speed_mps: 22.22 });
    expect(det.check(1100)).toBeNull();
  });

  it('reset() clears the buffer', () => {
    const det = new CalibrationStabilityDetector({ duration_ms: 500, max_speed_delta_kmh: 1.0 });
    det.push({ t_ms: 0, speed_mps: 10 });
    det.push({ t_ms: 600, speed_mps: 10 });
    det.reset();
    expect(det.check(700)).toBeNull();
  });
});
