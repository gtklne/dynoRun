import { describe, it, expect } from 'vitest';
import { detectPlateaus, slicePlateauSamples } from '@/analysis/plateau-detection';
import type { RawSpeedSample } from '@/analysis/types';
import { kmhToMps, mpsToKmh } from '@/shared/units';

/**
 * Build a 1 Hz speed trace (like real GPS) from piecewise segments.
 * Each segment holds an acceleration (m/s²) for a duration. `jitter` adds an
 * alternating +/- km/h wobble on top: at 1 Hz its period is shorter than the
 * smoothing window, so it survives only in the raw samples.
 */
function ride(
  segments: Array<{ accel: number; seconds: number; jitter?: number }>,
  v0 = 0,
): RawSpeedSample[] {
  const out: RawSpeedSample[] = [];
  let v = v0;
  let t = 0;
  out.push({ t_ms: 0, speed_mps: v });
  for (const seg of segments) {
    for (let s = 0; s < seg.seconds; s++) {
      v = Math.max(0, v + seg.accel);
      t += 1000;
      const wobble = seg.jitter ? (s % 2 === 0 ? seg.jitter : -seg.jitter) : 0;
      out.push({ t_ms: t, speed_mps: Math.max(0, v + kmhToMps(wobble)) });
    }
  }
  return out;
}

// 5 s stopped, 10 s of hard acceleration to 90 km/h, 15 s held there, then off.
const singleHold = () => ride([
  { accel: 0, seconds: 5 },
  { accel: 2.5, seconds: 10 },
  { accel: 0, seconds: 15 },
  { accel: -2.5, seconds: 10 },
]);

// Five holds at 54, 76, 97, 119 and 140 km/h, the last one a little longer.
const fiveHolds = () => ride([
  { accel: 1.5, seconds: 10 },
  { accel: 0, seconds: 10 },
  { accel: 1.5, seconds: 4 },
  { accel: 0, seconds: 10 },
  { accel: 1.5, seconds: 4 },
  { accel: 0, seconds: 10 },
  { accel: 1.5, seconds: 4 },
  { accel: 0, seconds: 10 },
  { accel: 1.5, seconds: 4 },
  { accel: 0, seconds: 10 },
  { accel: -2.0, seconds: 19 },
]);

describe('detectPlateaus', () => {
  it('returns empty for empty and tiny inputs', () => {
    expect(detectPlateaus([])).toEqual([]);
    expect(detectPlateaus([{ t_ms: 0, speed_mps: 0 }])).toEqual([]);
  });

  it('finds nothing while standing still or creeping', () => {
    expect(detectPlateaus(ride([{ accel: 0, seconds: 300 }]))).toEqual([]);
    // Perfectly steady, but no gear ratio is calibrated at 12 km/h.
    expect(detectPlateaus(ride([{ accel: 0, seconds: 60 }], kmhToMps(12)))).toEqual([]);
  });

  it('finds nothing in a hard acceleration ramp', () => {
    expect(detectPlateaus(ride([
      { accel: 0, seconds: 5 },
      { accel: 3.0, seconds: 15 },
    ]))).toEqual([]);
  });

  it('detects a single deliberate hold', () => {
    const plateaus = detectPlateaus(singleHold());
    expect(plateaus.length).toBe(1);
    const hold = plateaus[0];
    expect(Math.abs(hold.mean_speed_kmh - 90)).toBeLessThan(1);
    expect(hold.spread_kmh).toBeLessThan(0.5);
    expect(hold.duration_ms).toBeGreaterThanOrEqual(14_000);
    expect(hold.t_start_ms).toBeGreaterThanOrEqual(14_000);
    expect(hold.t_end_ms).toBeLessThanOrEqual(31_000);
  });

  it('reports about one raw fix per second for a normal 1 Hz hold', () => {
    const [hold] = detectPlateaus(singleHold());
    // 16 fixes over a 15 s window: both boundaries land on a fix, so a clean
    // 1 Hz recording reads a shade above 1 Hz rather than exactly at it.
    expect(hold.raw_samples).toBe(16);
    expect(hold.raw_coverage_hz).toBeGreaterThan(0.95);
    expect(hold.raw_coverage_hz).toBeLessThan(1.15);
  });

  it('ranks a 15 s hold above a much longer, looser cruise', () => {
    const samples = ride([
      { accel: 1.4, seconds: 10 },       // up to ~50 km/h
      { accel: 0.002, seconds: 60 },     // 120 s cruise, drifting up
      { accel: -0.002, seconds: 60 },    // and back down
      { accel: 1.4, seconds: 8 },        // up to ~90 km/h
      { accel: 0, seconds: 15, jitter: 0.1 },
      { accel: -2.5, seconds: 10 },
    ]);
    const plateaus = detectPlateaus(samples);
    expect(plateaus.length).toBe(2);

    const hold = plateaus.find((p) => p.mean_speed_kmh > 70);
    const cruise = plateaus.find((p) => p.mean_speed_kmh < 70);
    expect(hold).toBeDefined();
    expect(cruise).toBeDefined();
    expect(cruise!.duration_ms).toBeGreaterThan(100_000);
    expect(hold!.duration_ms).toBeLessThan(17_000);

    // Both clear the duration cap, so tightness alone decides and the hold,
    // eight times shorter, still comes first.
    expect(cruise!.spread_kmh).toBeGreaterThan(hold!.spread_kmh);
    expect(plateaus[0]).toBe(hold);
  });

  it('rejects a plateau fabricated across a GPS dropout', () => {
    const samples = ride([
      { accel: 0, seconds: 3 },
      { accel: 2.5, seconds: 10 },        // 0 to 90 km/h
      { accel: 0, seconds: 40 },          // 40 s at 90, mostly lost below
      { accel: -2.5, seconds: 10 },
      { accel: 0, seconds: 5 },
      { accel: 1.5, seconds: 11 },        // up to ~59 km/h
      { accel: 0, seconds: 15, jitter: 0.1 },  // the rider's real hold
      { accel: -2.0, seconds: 12 },
    // Fixes simply absent from 18 s to 48 s while t_ms keeps advancing, which
    // is what a suspend/resume mid ride looks like: performance.now() runs on.
    ]).filter((s) => s.t_ms <= 18_000 || s.t_ms >= 48_000);

    const plateaus = detectPlateaus(samples);
    expect(plateaus.length).toBe(1);
    expect(Math.abs(plateaus[0].mean_speed_kmh - 59.4)).toBeLessThan(1);
    expect(plateaus[0].t_start_ms).toBeGreaterThan(60_000);

    // With both guards off the interpolated stretch is not merely accepted, it
    // wins: 40 s of collinear grid points at a spread of exactly 0 scores a
    // perfect 1 and would be the pre-selected candidate.
    const unguarded = detectPlateaus(samples, { min_raw_coverage_hz: 0, max_raw_gap_ms: Infinity });
    expect(unguarded.length).toBe(2);
    expect(Math.abs(unguarded[0].mean_speed_kmh - 90)).toBeLessThan(1);
    expect(unguarded[0].score).toBe(1);
    expect(unguarded[0].score).toBeGreaterThan(unguarded[1].score);
    expect(unguarded[0].raw_coverage_hz).toBeCloseTo(0.3, 2);
    expect(unguarded[0].spread_kmh).toBe(0);
    expect(unguarded[0].max_raw_gap_ms).toBeGreaterThan(29_000);
  });

  it('catches a dropout the rate floor alone is blind to', () => {
    // A rate floor cannot see a hole shorter than half the window: 30 s missing
    // from a 60 s hold still leaves ~0.53 Hz, comfortably over the 0.5 floor,
    // while the 30 s of interpolated points are pure fiction. Only the max-gap
    // check rejects this.
    const samples = ride([
      { accel: 0, seconds: 3 },
      { accel: 2.5, seconds: 10 },        // 0 to 90 km/h
      { accel: 0, seconds: 60 },          // 60 s at 90, half of it lost
      { accel: -2.5, seconds: 10 },
    ]).filter((s) => s.t_ms <= 28_000 || s.t_ms >= 58_000);

    const rateOnly = detectPlateaus(samples, { max_raw_gap_ms: Infinity });
    expect(rateOnly.length).toBe(1);
    expect(rateOnly[0].raw_coverage_hz).toBeGreaterThan(0.5);
    expect(rateOnly[0].spread_kmh).toBe(0);

    expect(detectPlateaus(samples)).toEqual([]);
  });

  it('rejects a window that only looks steady after smoothing', () => {
    const jittery = (jitter: number) => ride([
      { accel: 0, seconds: 3 },
      { accel: 2.5, seconds: 10 },
      { accel: 0, seconds: 20, jitter },
      { accel: -2.5, seconds: 10 },
    ]);

    expect(detectPlateaus(jittery(3))).toEqual([]);

    // The sweep does locate that window, the raw spread is what rejects it:
    // lift the ceiling past the wobble and the same stretch comes back
    // reporting all 6 km/h of it, a figure the 1.8 s smoothing window irons
    // out to almost nothing.
    const loose = detectPlateaus(jittery(3), { max_spread_kmh: 6.5 });
    expect(loose.length).toBe(1);
    expect(loose[0].spread_kmh).toBeCloseTo(6, 1);
    expect(loose[0].duration_ms).toBeGreaterThan(18_000);

    // Same shape, a wobble a rider could hold: kept, and the spread is the raw
    // one rather than the smoothed one.
    const held = detectPlateaus(jittery(0.2));
    expect(held.length).toBe(1);
    expect(held[0].spread_kmh).toBeCloseTo(0.4, 3);
  });

  it('finds holds at the very start and the very end of a recording', () => {
    // The smoothing leaves the first and last points untouched, so an edge
    // plateau must not depend on being smoothed like an interior one.
    const plateaus = detectPlateaus(ride([
      { accel: 0, seconds: 15 },
      { accel: -1.0, seconds: 5 },
      { accel: 0, seconds: 15 },
    ], kmhToMps(90)));

    expect(plateaus.length).toBe(2);
    const first = plateaus.find((p) => p.mean_speed_kmh > 80);
    const last = plateaus.find((p) => p.mean_speed_kmh < 80);
    expect(first!.t_start_ms).toBe(0);
    expect(Math.abs(first!.mean_speed_kmh - 90)).toBeLessThan(1);
    expect(last!.t_end_ms).toBe(35_000);
    expect(Math.abs(last!.mean_speed_kmh - 72)).toBeLessThan(1);
  });

  it('collapses two holds at nearly the same speed', () => {
    const samples = ride([
      { accel: 0, seconds: 3 },
      { accel: 2.5, seconds: 10 },
      { accel: 0, seconds: 12 },         // first hold at 90
      { accel: -3.0, seconds: 5 },       // brake and pick it up again
      { accel: 3.0, seconds: 5 },
      { accel: 0.4 / 3.6, seconds: 1 },
      { accel: 0, seconds: 12 },         // second hold, 0.4 km/h higher
      { accel: -2.5, seconds: 10 },
    ]);

    const plateaus = detectPlateaus(samples);
    expect(plateaus.length).toBe(1);
    expect(Math.abs(plateaus[0].mean_speed_kmh - 90)).toBeLessThan(1);

    // Both windows exist; it is the dedupe tolerance that drops one.
    const separate = detectPlateaus(samples, { dedupe_speed_kmh: 0.05 });
    expect(separate.length).toBe(2);
    expect(separate[1].t_start_ms).toBeGreaterThan(separate[0].t_end_ms);
  });

  it('truncates to max_candidates, keeping the best', () => {
    const samples = fiveHolds();
    const all = detectPlateaus(samples);
    expect(all.length).toBe(5);

    const capped = detectPlateaus(samples, { max_candidates: 3 });
    expect(capped.map((p) => p.t_start_ms)).toEqual(all.slice(0, 3).map((p) => p.t_start_ms));
  });

  it('returns candidates best-first, not chronologically', () => {
    const plateaus = detectPlateaus(fiveHolds());
    for (let i = 1; i < plateaus.length; i++) {
      expect(plateaus[i - 1].score).toBeGreaterThanOrEqual(plateaus[i].score);
    }
    // The longest hold is the last one in the ride, so best-first is visibly
    // not chronological here.
    expect(plateaus[0].t_start_ms).toBeGreaterThan(plateaus[1].t_start_ms);
  });
});

describe('slicePlateauSamples', () => {
  it('slices the raw samples of a plateau and rebases t_ms to 0', () => {
    const samples = singleHold();
    const [plateau] = detectPlateaus(samples);
    const slice = slicePlateauSamples(samples, plateau);

    expect(slice.length).toBe(plateau.raw_samples);
    expect(slice[0].t_ms).toBe(0);
    // Span matches the plateau duration to within one detection-grid step on
    // each side.
    expect(Math.abs(slice[slice.length - 1].t_ms - plateau.duration_ms)).toBeLessThanOrEqual(400);
    expect(slice.every((s) => s.t_ms >= 0 && s.t_ms <= plateau.duration_ms)).toBe(true);
    // Speeds are untouched, and they are the ones the plateau was measured on.
    const speedsKmh = slice.map((s) => mpsToKmh(s.speed_mps));
    expect(Math.max(...speedsKmh) - Math.min(...speedsKmh)).toBeCloseTo(plateau.spread_kmh, 6);
  });

  it('returns empty when no raw sample falls inside the plateau', () => {
    const [plateau] = detectPlateaus(singleHold());
    expect(slicePlateauSamples([], plateau)).toEqual([]);
  });
});
