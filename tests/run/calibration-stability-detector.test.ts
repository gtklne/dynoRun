import { describe, it, expect } from 'vitest';
import { CalibrationStabilityDetector } from '@/run/calibration-stability-detector';
import { DEFAULT_STABILITY_WINDOW, type StabilityWindow } from '@/run/types';
import { kmhToMps } from '@/shared/units';

const window5s: StabilityWindow = DEFAULT_STABILITY_WINDOW;

/** Holds one speed at 1 Hz for `count` samples starting at `from_ms`. */
function hold(d: CalibrationStabilityDetector, from_ms: number, count: number, kmh: number): number {
  let t = from_ms;
  for (let i = 0; i < count; i++) {
    d.push({ t_ms: t, speed_mps: kmhToMps(kmh) });
    t += 1000;
  }
  return t - 1000;
}

describe('CalibrationStabilityDetector', () => {
  it('captures a genuine steady cruise', () => {
    const d = new CalibrationStabilityDetector(window5s);
    const last = hold(d, 0, 8, 90);
    const res = d.check(last);
    expect(res).not.toBeNull();
    expect(res?.captured_speed_kmh).toBeCloseTo(90, 6);
  });

  it('refuses to capture at standstill, however stable it is', () => {
    // Tapping "Start measurement" in the garage: 0 km/h is the most stable
    // reading the GPS will ever produce, and the server rejects it with a 400.
    const d = new CalibrationStabilityDetector(window5s);
    const last = hold(d, 0, 8, 0);
    expect(d.check(last)).toBeNull();
    // Still refuses after a minute of it, so the wizard keeps listening.
    expect(d.check(hold(d, 8000, 60, 0))).toBeNull();
  });

  it('refuses to capture a creep below the floor', () => {
    const d = new CalibrationStabilityDetector(window5s);
    expect(d.check(hold(d, 0, 8, 8))).toBeNull();
  });

  it('captures at exactly the floor', () => {
    const d = new CalibrationStabilityDetector(window5s);
    const res = d.check(hold(d, 0, 8, DEFAULT_STABILITY_WINDOW.min_speed_kmh));
    expect(res?.captured_speed_kmh).toBeCloseTo(10, 6);
  });

  it('keeps reporting live stability while parked so the UI stays honest', () => {
    const d = new CalibrationStabilityDetector(window5s);
    const last = hold(d, 0, 8, 0);
    const p = d.progress(last);
    expect(p.elapsed_ms).toBe(5000);
    expect(p.speed_delta_kmh).toBe(0);
    expect(d.check(last)).toBeNull();
  });

  it('refuses a window wider than the allowed delta', () => {
    const d = new CalibrationStabilityDetector(window5s);
    d.push({ t_ms: 0, speed_mps: kmhToMps(90) });
    for (let i = 1; i <= 6; i++) {
      d.push({ t_ms: i * 1000, speed_mps: kmhToMps(90 + i * 0.4) });
    }
    expect(d.check(6000)).toBeNull();
  });

  it('needs an anchor sample older than the window', () => {
    const d = new CalibrationStabilityDetector(window5s);
    const last = hold(d, 0, 5, 90);
    expect(last).toBe(4000);
    expect(d.check(last)).toBeNull();
    // t_ms 0 is the anchor, and it only counts once it is strictly older
    // than the window.
    d.push({ t_ms: 5000, speed_mps: kmhToMps(90) });
    expect(d.check(5000)).toBeNull();
    d.push({ t_ms: 6000, speed_mps: kmhToMps(90) });
    expect(d.check(6000)).not.toBeNull();
  });

  it('reset clears the buffer', () => {
    const d = new CalibrationStabilityDetector(window5s);
    const last = hold(d, 0, 8, 90);
    d.reset();
    expect(d.check(last)).toBeNull();
  });
});
