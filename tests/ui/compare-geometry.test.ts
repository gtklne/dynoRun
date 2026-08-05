import { describe, expect, it } from 'vitest';
import { fitTrackTransform } from '@/ui/grip/track-geometry';
import { distanceFrame, niceStep } from '@/ui/grip/compare-chart-frame';
import { nearestIndex } from '@/ui/grip/compare-delta-chart';
import { deltaColor, formatDelta, deltaTextClass, seriesColor, SERIES_COLORS } from '@/ui/grip/compare-colors';

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
  it('gives the reference the baseline colour and cycles the rest', () => {
    expect(seriesColor(0)).toBe(SERIES_COLORS[0]);
    expect(seriesColor(SERIES_COLORS.length)).toBe(SERIES_COLORS[0]);
  });

  it('never uses the demand ramp’s green/amber/red for series identity', () => {
    // colors.ts owns #0ca30c / #fab219 / #d03b3b as *values*, not identities
    for (const c of SERIES_COLORS) {
      expect(['#0ca30c', '#fab219', '#d03b3b']).not.toContain(c);
    }
  });

  it('diverges around zero: lost time warm, gained time cool', () => {
    expect(deltaColor(0, 1)).toBe('rgb(82,82,91)');
    expect(deltaColor(2, 1)).toBe(deltaColor(1, 1)); // saturates
    expect(deltaColor(-2, 1)).toBe(deltaColor(-1, 1));
    expect(deltaColor(1, 1)).not.toBe(deltaColor(-1, 1));
    expect(deltaColor(0, 0)).toBe('rgb(82,82,91)'); // no divide-by-zero
  });

  it('formats signed deltas with an explicit sign', () => {
    expect(formatDelta(1.234)).toBe('+1.23');
    expect(formatDelta(-0.5)).toBe('−0.50');
    expect(formatDelta(0)).toBe('±0.00');
    expect(formatDelta(NaN)).toBe('—');
    expect(deltaTextClass(0.01)).toBe('text-zinc-400');
    expect(deltaTextClass(1)).toBe('text-rose-400');
    expect(deltaTextClass(-1)).toBe('text-sky-400');
  });
});
