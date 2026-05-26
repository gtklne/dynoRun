import { describe, it, expect } from 'vitest';
import { computeAccelTimes } from '@/analysis/accel-times';
import type { SmoothedSample } from '@/analysis/types';

const KMH = 1 / 3.6;

function constantAccel(opts: {
  v0_kmh: number;
  a_ms2: number;
  duration_s: number;
  step_ms?: number;
}): SmoothedSample[] {
  const step = opts.step_ms ?? 100;
  const v0 = opts.v0_kmh * KMH;
  const a = opts.a_ms2;
  const out: SmoothedSample[] = [];
  for (let t = 0; t <= opts.duration_s * 1000; t += step) {
    const s = t / 1000;
    out.push({ t_ms: t, speed_mps: v0 + a * s });
  }
  return out;
}

describe('computeAccelTimes', () => {
  it('returns zeros for empty input', () => {
    const r = computeAccelTimes([]);
    expect(r.duration_s).toBe(0);
    expect(r.distance_m).toBe(0);
    expect(r.intervals).toEqual([]);
    expect(r.quarter_mile).toBeNull();
  });

  it('computes 0-100 km/h for a clean constant-accel run', () => {
    // 0 to 100 km/h (27.78 m/s) at 5 m/s² → 5.556 s exactly.
    const samples = constantAccel({ v0_kmh: 0, a_ms2: 5, duration_s: 8 });
    const r = computeAccelTimes(samples);
    const zh = r.intervals.find((iv) => iv.from_kmh === 0 && iv.to_kmh === 100);
    expect(zh).toBeDefined();
    expect(zh!.elapsed_s).toBeCloseTo(100 / 3.6 / 5, 1);
    expect(r.start_speed_kmh).toBeCloseTo(0, 1);
    expect(r.peak_speed_kmh).toBeGreaterThan(100);
  });

  it('omits 0-start intervals when the run started rolling', () => {
    const samples = constantAccel({ v0_kmh: 30, a_ms2: 4, duration_s: 10 });
    const r = computeAccelTimes(samples);
    expect(r.intervals.find((iv) => iv.from_kmh === 0)).toBeUndefined();
    // 60-100 still reachable.
    const sixty = r.intervals.find((iv) => iv.from_kmh === 60 && iv.to_kmh === 100);
    expect(sixty).toBeDefined();
    expect(sixty!.elapsed_s).toBeCloseTo((100 - 60) / 3.6 / 4, 1);
  });

  it('reports 100-200 only when both speeds are crossed', () => {
    const slow = constantAccel({ v0_kmh: 50, a_ms2: 3, duration_s: 6 });
    const fast = constantAccel({ v0_kmh: 50, a_ms2: 3, duration_s: 20 });
    expect(computeAccelTimes(slow).intervals.find((iv) => iv.to_kmh === 200)).toBeUndefined();
    expect(computeAccelTimes(fast).intervals.find((iv) => iv.to_kmh === 200)).toBeDefined();
  });

  it('computes a quarter mile time and trap speed for a long pull', () => {
    const samples = constantAccel({ v0_kmh: 0, a_ms2: 4, duration_s: 20 });
    const r = computeAccelTimes(samples);
    expect(r.quarter_mile).not.toBeNull();
    // d = 0.5*a*t² → 402.336 = 2*t² → t = √201.168 ≈ 14.18 s
    expect(r.quarter_mile!.elapsed_s).toBeCloseTo(Math.sqrt(2 * 402.336 / 4), 0);
    // trap speed = a*t
    expect(r.quarter_mile!.trap_speed_kmh).toBeCloseTo(4 * r.quarter_mile!.elapsed_s * 3.6, 0);
  });

  it('skips the quarter mile when the run started rolling', () => {
    const samples = constantAccel({ v0_kmh: 60, a_ms2: 3, duration_s: 30 });
    const r = computeAccelTimes(samples);
    expect(r.quarter_mile).toBeNull();
  });

  it('accumulates total distance via trapezoidal integration', () => {
    const samples = constantAccel({ v0_kmh: 0, a_ms2: 5, duration_s: 5 });
    const r = computeAccelTimes(samples);
    // d = 0.5 * 5 * 25 = 62.5 m
    expect(r.distance_m).toBeCloseTo(62.5, 0);
  });
});
