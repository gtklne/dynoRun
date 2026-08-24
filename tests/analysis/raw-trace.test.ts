import { describe, it, expect } from 'vitest';
import {
  buildRawTrace,
  accelInG,
  FROZEN_MIN_SPEED_MPS,
  RAW_GAP_MS,
  GAP_MEDIAN_FACTOR,
} from '@/analysis/raw-trace';
import { PEAK_ACCEL_SUSPICIOUS_MS2 } from '@/analysis/run-quality';
import type { RawSpeedSample } from '@/analysis/types';

// Run d3de969d, a hands-free pull that the pipeline reported as 160.3 kW
// (215 hp) from a 290 kg motorcycle whose engine makes about 128. Every value
// is verbatim from the `samples` rows, so this fixture is the acceptance case:
// if the readout cannot make this run look wrong, it is not worth shipping.
const REAL_RUN: RawSpeedSample[] = [
  { t_ms: 0, speed_mps: 6.910359 },
  { t_ms: 989, speed_mps: 7.824923 },
  { t_ms: 1982, speed_mps: 8.1315155 },
  { t_ms: 2985, speed_mps: 8.187438 },
  { t_ms: 3980, speed_mps: 8.6754875 },
  { t_ms: 4986, speed_mps: 10.038628 },
  { t_ms: 5981, speed_mps: 11.025276 },
  { t_ms: 6987, speed_mps: 10.768769 },
  { t_ms: 7982, speed_mps: 18.879076 },
  { t_ms: 8986, speed_mps: 18.879074 },
  { t_ms: 9986, speed_mps: 25.850077 },
  { t_ms: 10983, speed_mps: 38.98678 },
];

function ramp(count: number, stepMs: number, a: number): RawSpeedSample[] {
  return Array.from({ length: count }, (_, i) => ({
    t_ms: i * stepMs,
    speed_mps: 10 + a * ((i * stepMs) / 1000),
  }));
}

describe('buildRawTrace', () => {
  it('flags the frozen fix and the catch-up spike in the real 215 hp run', () => {
    const trace = buildRawTrace(REAL_RUN);

    // The receiver repeated 18.879 m/s. Stored as float32 the two differ by
    // ~2e-6, so an equality test would miss it.
    expect(trace.frozen_count).toBe(1);
    const frozen = trace.points.filter((p) => p.flags.includes('frozen'));
    expect(frozen[0].t_ms).toBe(8986);

    // The step straight after it carries two seconds of acceleration in one.
    expect(trace.spike_count).toBe(1);
    const spike = trace.points.find((p) => p.flags.includes('spike'));
    expect(spike?.t_ms).toBe(10983);
    expect(spike?.accel_ms2).toBeCloseTo(13.18, 1);
    expect(accelInG(spike!.accel_ms2!)).toBeGreaterThan(1.3);

    expect(trace.peak_raw_accel_ms2).toBeCloseTo(13.18, 1);
    expect(trace.fix_rate_hz).toBeCloseTo(1.0, 1);
  });

  it('leaves a clean 10 Hz pull unflagged', () => {
    const trace = buildRawTrace(ramp(60, 100, 3));
    expect(trace.frozen_count).toBe(0);
    expect(trace.spike_count).toBe(0);
    expect(trace.gap_count).toBe(0);
    expect(trace.fix_rate_hz).toBeCloseTo(10, 0);
    expect(trace.peak_raw_accel_ms2).toBeCloseTo(3, 2);
  });

  it('does not call a stationary vehicle frozen', () => {
    // Standing still is perfectly stable, and a repeated 0 says nothing about
    // the receiver. Only repeats fast enough to matter for a pull count.
    const parked: RawSpeedSample[] = [
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 1000, speed_mps: 0 },
      { t_ms: 2000, speed_mps: 0 },
      { t_ms: 3000, speed_mps: FROZEN_MIN_SPEED_MPS - 0.5 },
      { t_ms: 4000, speed_mps: FROZEN_MIN_SPEED_MPS - 0.5 },
    ];
    expect(buildRawTrace(parked).frozen_count).toBe(0);
  });

  it('flags a repeat once the vehicle is actually moving', () => {
    const rolling: RawSpeedSample[] = [
      { t_ms: 0, speed_mps: 20 },
      { t_ms: 1000, speed_mps: 20 },
    ];
    expect(buildRawTrace(rolling).frozen_count).toBe(1);
  });

  it('flags a real dropout inside an otherwise dense stream', () => {
    const dropped = ramp(20, 100, 2);
    // Punch a 1.5 s hole after the tenth fix.
    for (let i = 10; i < dropped.length; i++) dropped[i].t_ms += 1500;
    const trace = buildRawTrace(dropped);
    expect(trace.gap_count).toBe(1);
    expect(trace.points[10].flags).toContain('gap');
    expect(trace.median_gap_ms).toBe(100);
    expect(trace.gap_ceiling_ms).toBe(RAW_GAP_MS);
  });

  it('does not call a steady 1 Hz cadence a series of dropouts', () => {
    // Every interval of a regular 1 Hz run clears the absolute 500 ms floor, so
    // an absolute-only rule flagged all of them and buried the real findings.
    const trace = buildRawTrace(REAL_RUN);
    expect(trace.gap_count).toBe(0);
    expect(trace.median_gap_ms).toBeGreaterThan(RAW_GAP_MS);
    expect(trace.gap_ceiling_ms).toBeCloseTo(trace.median_gap_ms * GAP_MEDIAN_FACTOR, 5);
  });

  it('still calls a hole a dropout at a slow cadence', () => {
    const slowWithHole: RawSpeedSample[] = [
      { t_ms: 0, speed_mps: 10 },
      { t_ms: 1000, speed_mps: 12 },
      { t_ms: 2000, speed_mps: 14 },
      { t_ms: 6000, speed_mps: 22 },
      { t_ms: 7000, speed_mps: 24 },
    ];
    const trace = buildRawTrace(slowWithHole);
    expect(trace.gap_count).toBe(1);
    expect(trace.points[3].flags).toContain('gap');
  });

  it('marks the fixes past peak speed as unused, matching the pipeline trim', () => {
    const withCoast: RawSpeedSample[] = [
      { t_ms: 0, speed_mps: 10 },
      { t_ms: 1000, speed_mps: 20 },
      { t_ms: 2000, speed_mps: 30 },
      { t_ms: 3000, speed_mps: 25 },
      { t_ms: 4000, speed_mps: 18 },
    ];
    const trace = buildRawTrace(withCoast);
    expect(trace.trim_index).toBe(2);
    expect(trace.points.map((p) => p.used)).toEqual([true, true, true, false, false]);
    // The smoothed overlay is the pipeline's own grid, so it stops at the trim.
    const lastSmoothed = trace.smoothed[trace.smoothed.length - 1];
    expect(lastSmoothed.t_ms).toBeLessThanOrEqual(2000);
  });

  it('reports the trace the pipeline actually differentiated, not the raw fixes', () => {
    const trace = buildRawTrace(ramp(30, 100, 2), { resample_step_ms: 100, smooth_window: 11 });
    // resample lands on a uniform grid, so there are far more smoothed points
    // than raw fixes even when the two happen to share a step here.
    expect(trace.smoothed.length).toBeGreaterThan(0);
    for (let i = 1; i < trace.smoothed.length; i++) {
      expect(trace.smoothed[i].t_ms).toBeGreaterThan(trace.smoothed[i - 1].t_ms);
    }
  });

  it('sorts out-of-order samples before differencing', () => {
    const shuffled: RawSpeedSample[] = [
      { t_ms: 2000, speed_mps: 30 },
      { t_ms: 0, speed_mps: 10 },
      { t_ms: 1000, speed_mps: 20 },
    ];
    const trace = buildRawTrace(shuffled);
    expect(trace.points.map((p) => p.t_ms)).toEqual([0, 1000, 2000]);
    expect(trace.points[1].accel_ms2).toBeCloseTo(10, 5);
  });

  it('honours a custom acceleration ceiling', () => {
    const gentle = buildRawTrace(REAL_RUN, { accel_ceiling_ms2: PEAK_ACCEL_SUSPICIOUS_MS2 });
    const strict = buildRawTrace(REAL_RUN, { accel_ceiling_ms2: 6 });
    expect(strict.spike_count).toBeGreaterThan(gentle.spike_count);
  });

  it('degrades safely on a run with too few fixes to difference', () => {
    expect(buildRawTrace([]).points).toEqual([]);
    const one = buildRawTrace([{ t_ms: 0, speed_mps: 10 }]);
    expect(one.points).toHaveLength(1);
    expect(one.points[0].accel_ms2).toBeNull();
    expect(one.fix_rate_hz).toBe(0);
    expect(one.peak_raw_accel_ms2).toBe(0);
  });
});
