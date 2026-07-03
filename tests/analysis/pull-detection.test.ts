import { describe, it, expect } from 'vitest';
import { detectPulls, slicePullSamples } from '@/analysis/pull-detection';
import type { RawSpeedSample } from '@/analysis/types';
import { kmhToMps, mpsToKmh } from '@/shared/units';

/**
 * Build a 1 Hz speed trace (like real GPS) from piecewise segments.
 * Each segment holds an acceleration (m/s²) for a duration.
 */
function ride(segments: Array<{ accel: number; seconds: number }>, v0 = 0): RawSpeedSample[] {
  const out: RawSpeedSample[] = [];
  let v = v0;
  let t = 0;
  out.push({ t_ms: 0, speed_mps: v });
  for (const seg of segments) {
    for (let s = 0; s < seg.seconds; s++) {
      v = Math.max(0, v + seg.accel);
      t += 1000;
      out.push({ t_ms: t, speed_mps: v });
    }
  }
  return out;
}

describe('detectPulls', () => {
  it('returns empty for empty and tiny inputs', () => {
    expect(detectPulls([])).toEqual([]);
    expect(detectPulls([{ t_ms: 0, speed_mps: 0 }])).toEqual([]);
  });

  it('finds nothing in a constant-speed cruise', () => {
    const samples = ride([{ accel: 0, seconds: 120 }], kmhToMps(80));
    expect(detectPulls(samples)).toEqual([]);
  });

  it('finds nothing while standing still', () => {
    const samples = ride([{ accel: 0, seconds: 300 }], 0);
    expect(detectPulls(samples)).toEqual([]);
  });

  it('detects a single hard pull embedded in a ride', () => {
    const samples = ride([
      { accel: 0, seconds: 60 },        // standing at the start line
      { accel: 1.0, seconds: 15 },      // gentle ride up to ~54 km/h
      { accel: 0, seconds: 20 },        // settle in gear
      { accel: 3.0, seconds: 10 },      // the pull: +108 km/h
      { accel: -1.5, seconds: 25 },     // coast down
      { accel: 0, seconds: 30 },        // ride back
    ]);
    const pulls = detectPulls(samples);
    // The gentle ride-off is itself a valid acceleration segment (+54 km/h),
    // the hard pull is the second.
    expect(pulls.length).toBe(2);
    const pull = pulls[1];
    expect(pull.t_start_ms).toBeGreaterThan(90_000);
    expect(pull.t_start_ms).toBeLessThan(97_000);
    expect(mpsToKmh(pull.speed_gain_mps)).toBeGreaterThan(90);
    expect(mpsToKmh(pull.v_peak_mps)).toBeGreaterThan(150);
  });

  it('keeps a pull whole across a brief shift dip', () => {
    const samples = ride([
      { accel: 0, seconds: 30 },
      { accel: 3.0, seconds: 6 },
      { accel: -0.5, seconds: 1 },      // clutch in, upshift
      { accel: 2.5, seconds: 6 },
      { accel: -1.0, seconds: 20 },
    ]);
    const pulls = detectPulls(samples);
    expect(pulls.length).toBe(1);
    expect(pulls[0].duration_ms).toBeGreaterThanOrEqual(12_000);
  });

  it('splits two pulls separated by a settle period', () => {
    const samples = ride([
      { accel: 0, seconds: 20 },
      { accel: 2.5, seconds: 8 },
      { accel: 0, seconds: 15 },        // deliberate settle between pulls
      { accel: -2.0, seconds: 8 },      // brake back down
      { accel: 0, seconds: 10 },
      { accel: 3.0, seconds: 8 },
      { accel: -1.0, seconds: 15 },
    ]);
    const pulls = detectPulls(samples);
    expect(pulls.length).toBe(2);
    expect(pulls[1].t_start_ms).toBeGreaterThan(pulls[0].t_end_ms);
  });

  it('ignores accelerations that gain too little speed', () => {
    // +10 km/h nudge — below the 15 km/h gain threshold.
    const samples = ride([
      { accel: 0, seconds: 30 },
      { accel: 0.9, seconds: 3 },
      { accel: 0, seconds: 30 },
    ], kmhToMps(60));
    expect(detectPulls(samples)).toEqual([]);
  });

  it('ignores slow parking-lot movements below the peak-speed floor', () => {
    // 0 → 20 km/h never reaches the 30 km/h peak floor.
    const samples = ride([
      { accel: 0, seconds: 10 },
      { accel: 0.55, seconds: 10 },
      { accel: 0, seconds: 10 },
    ]);
    expect(detectPulls(samples)).toEqual([]);
  });

  it('starts the pull at the local speed minimum, not mid-slope', () => {
    const samples = ride([
      { accel: 0, seconds: 30 },
      { accel: -1.0, seconds: 10 },     // slow from 80 to ~44 km/h
      { accel: 3.0, seconds: 10 },      // pull from the trough
      { accel: 0, seconds: 20 },
    ], kmhToMps(80));
    const pulls = detectPulls(samples);
    expect(pulls.length).toBe(1);
    // v_start should be near the trough (~44 km/h), not up at 80.
    expect(mpsToKmh(pulls[0].v_start_mps)).toBeLessThan(55);
  });

  it('does not drag the start back through a long standstill', () => {
    const samples = ride([
      { accel: 0, seconds: 120 },       // 2 min standing
      { accel: 3.0, seconds: 10 },
      { accel: 0, seconds: 10 },
    ]);
    const pulls = detectPulls(samples);
    expect(pulls.length).toBe(1);
    expect(pulls[0].t_start_ms).toBeGreaterThan(110_000);
  });

  it('rejects implausibly long acceleration segments', () => {
    const samples = ride([
      { accel: 0, seconds: 10 },
      { accel: 0.35, seconds: 200 },    // 200 s of creeping accel — not a pull
      { accel: 0, seconds: 10 },
    ]);
    expect(detectPulls(samples)).toEqual([]);
  });
});

describe('slicePullSamples', () => {
  it('slices the raw samples of a pull and rebases t_ms to 0', () => {
    const samples = ride([
      { accel: 0, seconds: 30 },
      { accel: 3.0, seconds: 10 },
      { accel: -1.0, seconds: 20 },
    ]);
    const [pull] = detectPulls(samples);
    const slice = slicePullSamples(samples, pull);
    expect(slice.length).toBeGreaterThan(5);
    expect(slice[0].t_ms).toBe(0);
    // Span matches the pull duration to within one detection-grid step on each side.
    expect(Math.abs(slice[slice.length - 1].t_ms - pull.duration_ms)).toBeLessThanOrEqual(400);
    // Speeds are untouched — the slice ends at the pull's peak.
    expect(slice[slice.length - 1].speed_mps).toBeCloseTo(
      Math.max(...slice.map((s) => s.speed_mps)),
      5,
    );
  });
});
