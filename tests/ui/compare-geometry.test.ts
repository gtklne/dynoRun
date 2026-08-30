import { describe, expect, it } from 'vitest';
import { fitTrackTransform } from '@/ui/grip/track-geometry';
import { distanceFrame, niceStep } from '@/ui/grip/compare-chart-frame';
import { nearestIndex } from '@/ui/grip/compare-delta-chart';
import { deltaColor, formatDelta, deltaTextClass, seriesColor, seriesDash, MAX_COMPARE_LAPS } from '@/ui/grip/compare-colors';
import { readPlateInk } from '@/ui/plate';

describe('fitTrackTransform', () => {
  it('centres and scales a shape to fit inside the padding', () => {
    const px = new Float32Array([0, 100, 100, 0]);
    const py = new Float32Array([0, 0, 50, 50]);
    const f = fitTrackTransform(px, py, 0, 3, 200, 200, 10);
    // wider than tall, so width is the limiting dimension: 180 px / 100 m
    expect(f.scale).toBeCloseTo(1.8, 6);
    expect(f.X(0)).toBeCloseTo(10, 6);
    expect(f.X(100)).toBeCloseTo(190, 6);
    // y is flipped so north is up, and the shape is vertically centred
    expect(f.Y(0)).toBeGreaterThan(f.Y(50));
    expect(f.cx).toBeCloseTo(100, 6);
    expect(f.cy).toBeCloseTo(100, 6);
  });

  it('does not divide by zero on a degenerate or empty extent', () => {
    const one = fitTrackTransform(new Float32Array([5]), new Float32Array([5]), 0, 0, 100, 100, 10);
    expect(Number.isFinite(one.X(5))).toBe(true);
    expect(Number.isFinite(one.Y(5))).toBe(true);
    const none = fitTrackTransform(new Float32Array([]), new Float32Array([]), 0, -1, 100, 100, 10);
    expect(Number.isFinite(none.scale)).toBe(true);
  });

  it('only measures the requested index range', () => {
    const px = new Float32Array([0, 10, 9999]);
    const py = new Float32Array([0, 10, 9999]);
    const f = fitTrackTransform(px, py, 0, 1, 100, 100, 0);
    expect(f.X(10)).toBeCloseTo(100, 6);
  });
});

describe('distanceFrame', () => {
  it('maps metres to pixels and back', () => {
    const f = distanceFrame(400, 200, 1000);
    expect(f.X(0)).toBeCloseTo(f.x0, 6);
    expect(f.X(1000)).toBeCloseTo(f.x1, 6);
    expect(f.inv(f.X(250))).toBeCloseTo(250, 4);
  });

  it('survives a zero-length axis', () => {
    const f = distanceFrame(400, 200, 0);
    expect(Number.isFinite(f.X(0))).toBe(true);
    expect(Number.isFinite(f.inv(100))).toBe(true);
  });
});

describe('niceStep', () => {
  it('picks round divisions', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(1000, 5)).toBe(200);
    expect(niceStep(0.9, 3)).toBeCloseTo(0.2, 10);
    expect(niceStep(0, 5)).toBe(1);
  });
});

describe('nearestIndex', () => {
  const s = new Float32Array([0, 10, 20, 30, 40]);
  it('finds the closest station, not merely the preceding one', () => {
    expect(nearestIndex(s, 0)).toBe(0);
    expect(nearestIndex(s, 11)).toBe(1);
    expect(nearestIndex(s, 19)).toBe(2);
    expect(nearestIndex(s, 40)).toBe(4);
  });
  it('clamps outside the range', () => {
    expect(nearestIndex(s, -5)).toBe(0);
    expect(nearestIndex(s, 500)).toBe(4);
  });
});

describe('compare colours', () => {
  // jsdom resolves no custom properties, so this is the day plate's fallback
  // ink: the same source the components read, never a second hardcoded copy.
  const ink = readPlateInk();

  it('gives the subject procedure magenta and everything measured against it ink', () => {
    // The world spends magenta on "the line you actually flew", so series 0,
    // the lap or run under examination, takes it and the comparisons fall back
    // to ink. Ordering ink first inverted the rule: a single-series run curve
    // drew near-black and the only magenta on the screen was a button.
    expect(seriesColor(ink, 0)).toBe(ink.procedure);
    expect(seriesColor(ink, 1)).toBe(ink.ink);
    expect(seriesColor(ink, MAX_COMPARE_LAPS)).toBe(seriesColor(ink, 0));
    expect(seriesDash(MAX_COMPARE_LAPS)).toEqual(seriesDash(0));
  });

  it('separates six laps by colour AND dash, so hue alone is never the identity', () => {
    // The old guarantee (series ink never borrows the demand ramp's values) is
    // gone by design: every series ink is now a plate token, and some of those
    // tokens are also ramp stops. The dash pattern is what replaces it, so a
    // colour-blind reader and a phone in direct sun still separate six traces.
    const colors = new Set<string>();
    const dashes = new Set<string>();
    for (let i = 0; i < MAX_COMPARE_LAPS; i++) {
      colors.add(seriesColor(ink, i));
      dashes.add(seriesDash(i).join(','));
    }
    expect(colors.size).toBe(MAX_COMPARE_LAPS);
    expect(dashes.size).toBe(MAX_COMPARE_LAPS);
  });

  it('diverges around zero: lost time procedure, gained time gain, midpoint neutral', () => {
    const neutral = deltaColor(ink, 0, 1);
    expect(deltaColor(ink, 2, 1)).toBe(deltaColor(ink, 1, 1)); // saturates
    expect(deltaColor(ink, -2, 1)).toBe(deltaColor(ink, -1, 1));
    expect(deltaColor(ink, 1, 1)).not.toBe(deltaColor(ink, -1, 1));
    expect(deltaColor(ink, 0, 0)).toBe(neutral); // no divide-by-zero
    // a zero delta must not read as a small loss or a small gain
    expect(neutral).not.toBe(deltaColor(ink, 1, 1));
    expect(neutral).not.toBe(deltaColor(ink, -1, 1));
  });

  it('formats signed deltas with an explicit sign', () => {
    expect(formatDelta(1.234)).toBe('+1.23');
    expect(formatDelta(-0.5)).toBe('−0.50');
    expect(formatDelta(0)).toBe('±0.00');
    expect(formatDelta(NaN)).toBe('n/a');
    expect(deltaTextClass(0.01)).toBe('text-ink-3');
    expect(deltaTextClass(1)).toBe('text-procedure');
    expect(deltaTextClass(-1)).toBe('text-gain');
  });
});
