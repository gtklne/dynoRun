import { describe, expect, it } from 'vitest';
import {
  createMotionFusionState,
  onGpsFix,
  onMotionSample,
} from '@/sensors/motion-fusion';

describe('motion-fusion', () => {
  it('starts with no baseline', () => {
    const s = createMotionFusionState();
    expect(s.hasGpsBaseline).toBe(false);
    expect(onMotionSample(s, 1, 0, 0, 100)).toBeNull();
  });

  it('returns baseline speed after first GPS fix even without motion', () => {
    const s = createMotionFusionState();
    onGpsFix(s, 10);
    // dt invalid so it just returns baseline
    expect(onMotionSample(s, 0, 0, 0, 0)).toBe(10);
  });

  it('ignores motion samples with dt > 0.5s', () => {
    const s = createMotionFusionState();
    onGpsFix(s, 10);
    expect(onMotionSample(s, 5, 0, 0, 1000)).toBe(10);
    expect(onMotionSample(s, 5, 0, 0, 2000)).toBe(10);
  });

  it('integrates motion between GPS fixes', () => {
    const s = createMotionFusionState();
    onGpsFix(s, 10);
    // Establish forward axis = Y by giving a delta GPS update with prior integration on Y
    onMotionSample(s, 0, 1, 0, 1000);          // baseline tick (dt invalid)
    onMotionSample(s, 0, 1, 0, 1100);          // dt=0.1, intY += 0.1
    onMotionSample(s, 0, 1, 0, 1200);          // intY = 0.2
    // GPS fix with delta = 0.2 m/s (matches integrated Y, picks +Y axis)
    onGpsFix(s, 10.2);
    expect(s.forwardAxis[1]).toBeGreaterThan(0); // adapted toward +Y
    // Now feed a known acceleration on Y after baseline reset
    onMotionSample(s, 0, 1, 0, 1300);          // dt jumps from 1200, fine
    const fused = onMotionSample(s, 0, 1, 0, 1400);
    expect(fused).not.toBeNull();
    expect(fused!).toBeGreaterThan(10.2);
  });

  it('clamps correction so a runaway axis cannot blow up the readout', () => {
    const s = createMotionFusionState();
    onGpsFix(s, 5);
    // Massive acceleration spikes should not push fused speed unbounded
    let last: number | null = null;
    for (let i = 0; i < 50; i++) {
      last = onMotionSample(s, 100, 0, 0, 1000 + i * 100);
    }
    expect(last).not.toBeNull();
    // Baseline was 5, max correction is 8 → fused <= 13
    expect(last!).toBeLessThanOrEqual(13);
  });

  it('cannot return a negative fused speed', () => {
    const s = createMotionFusionState();
    onGpsFix(s, 1);
    // Negative integrated motion projected by some learned axis
    let last: number | null = null;
    for (let i = 0; i < 20; i++) {
      last = onMotionSample(s, -50, 0, 0, 1000 + i * 100);
    }
    expect(last).not.toBeNull();
    expect(last!).toBeGreaterThanOrEqual(0);
  });

  it('resets integrators on each GPS fix', () => {
    const s = createMotionFusionState();
    onGpsFix(s, 10);
    onMotionSample(s, 5, 0, 0, 1000);   // baseline tick
    onMotionSample(s, 5, 0, 0, 1100);   // intX += 0.5
    expect(s.intX).toBeCloseTo(0.5, 5);
    onGpsFix(s, 10);                    // no delta — integrators still reset
    expect(s.intX).toBe(0);
    expect(s.intY).toBe(0);
    expect(s.intZ).toBe(0);
  });
});
