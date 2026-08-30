import { describe, expect, it } from 'vitest';
import { fitTrackTransform } from '@/ui/grip/track-geometry';
import { distanceFrame, niceStep } from '@/ui/grip/compare-chart-frame';
import { nearestIndex } from '@/ui/grip/compare-delta-chart';
import { deltaColor, formatDelta, deltaTextClass, seriesColor, seriesDash, MAX_COMPARE_LAPS } from '@/ui/grip/compare-colors';
import { mixInk, rateColor, scoreColor } from '@/ui/grip/colors';
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
  // The ramps emit `rgb()` while the tokens are authored as hex, so both sides
  // go through the same blend before being compared. Without this the
  // "never a traffic-light colour" assertions pass for free on the notation
  // difference alone and would keep passing if a ramp did emit `go`.
  const norm = (c: string) => mixInk(c, c, 0);

  it('gives the subject full ink and steps the comparisons back', () => {
    // Series 0 is the lap or run under examination and is drawn in full ink;
    // everything it is measured against steps back to a lighter weight.
    expect(seriesColor(ink, 0)).toBe(ink.ink);
    expect(seriesColor(ink, 1)).toBe(ink.ink2);
    expect(seriesColor(ink, MAX_COMPARE_LAPS)).toBe(seriesColor(ink, 0));
    expect(seriesDash(MAX_COMPARE_LAPS)).toEqual(seriesDash(0));
  });

  it('never spends a traffic-light colour on lap identity', () => {
    // The load-bearing separation in this palette: green, amber and red mean
    // gained, read this, and lost. A lap cannot be "the green one" on a screen
    // where green also means you gained time, so identity is ink only and the
    // dash pattern carries the distinction.
    const judgement = new Set([ink.go, ink.caution, ink.stop]);
    for (let i = 0; i < MAX_COMPARE_LAPS; i++) {
      expect(judgement.has(seriesColor(ink, i))).toBe(false);
    }
  });

  it('separates six laps by colour AND dash together, never by hue alone', () => {
    // Colour alone cannot do it now (three ink weights across six laps) and
    // was never allowed to: the pair is the identity, and all six pairs must
    // be distinct for a colour-blind reader and for a phone in direct sun.
    const pairs = new Set<string>();
    const dashes = new Set<string>();
    for (let i = 0; i < MAX_COMPARE_LAPS; i++) {
      pairs.add(`${seriesColor(ink, i)}|${seriesDash(i).join(',')}`);
      dashes.add(seriesDash(i).join(','));
    }
    expect(pairs.size).toBe(MAX_COMPARE_LAPS);
    expect(dashes.size).toBe(MAX_COMPARE_LAPS);
  });

  it('diverges around zero: lost time stop, gained time go, midpoint neutral', () => {
    const neutral = deltaColor(ink, 0, 1);
    expect(deltaColor(ink, 2, 1)).toBe(deltaColor(ink, 1, 1)); // saturates
    expect(deltaColor(ink, -2, 1)).toBe(deltaColor(ink, -1, 1));
    expect(deltaColor(ink, 1, 1)).not.toBe(deltaColor(ink, -1, 1));
    expect(deltaColor(ink, 0, 0)).toBe(neutral); // no divide-by-zero
    // a zero delta must not read as a small loss or a small gain
    expect(neutral).not.toBe(deltaColor(ink, 1, 1));
    expect(neutral).not.toBe(deltaColor(ink, -1, 1));
    // and the ends are the traffic light itself, so "lost" can never drift back
    // to a hue that means something else on this sheet
    expect(deltaColor(ink, 1, 1)).toBe(norm(ink.stop));
    expect(deltaColor(ink, -1, 1)).toBe(norm(ink.go));
  });

  it('runs demand green to red and keeps load transfer off the traffic light', () => {
    // The user-facing rule: low demand is go, the tyre-class anchor is stop.
    expect(scoreColor(ink, 0, 1.1)).toBe(norm(ink.go));
    expect(scoreColor(ink, 0.605, 1.1)).toBe(norm(ink.caution)); // 55% of the anchor
    expect(scoreColor(ink, 1.1, 1.1)).toBe(norm(ink.stop));
    expect(scoreColor(ink, 2.2, 1.1)).toBe(norm(ink.stop)); // saturates, never wraps
    // Load transfer shares canvases with demand, so it must not be able to
    // produce a traffic-light colour at any point on its own scale.
    const judgement = new Set([norm(ink.go), norm(ink.caution), norm(ink.stop)]);
    for (let i = 0; i <= 10; i++) expect(judgement.has(rateColor(ink, i / 10))).toBe(false);
    expect(rateColor(ink, 0)).toBe(norm(ink.ink3));
    expect(rateColor(ink, 1)).toBe(norm(ink.ink));
  });

  it('formats signed deltas with an explicit sign', () => {
    expect(formatDelta(1.234)).toBe('+1.23');
    expect(formatDelta(-0.5)).toBe('−0.50');
    expect(formatDelta(0)).toBe('±0.00');
    expect(formatDelta(NaN)).toBe('n/a');
    // Judgement is the traffic light and nothing else: lost time is stop, gained
    // time is go, and anything inside the epsilon stays neutral ink so a lap
    // that merely matched the reference cannot read as slightly behind it.
    expect(deltaTextClass(0.01)).toBe('text-ink-3');
    expect(deltaTextClass(1)).toBe('text-stop');
    expect(deltaTextClass(-1)).toBe('text-go');
  });
});
