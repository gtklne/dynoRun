import { describe, expect, it } from 'vitest';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { bestLap } from '@/analysis/grip/laps';
import { cornerStats } from '@/analysis/grip/corners';
import { computeCombined } from '@/analysis/grip/load';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import { APEXES, BASE_SPEED, CORNER_DIP, LAP_S, PEAK_LEAN, syntheticCsv } from './synthetic';

const analyze = () => analyzeGripSession(parseRaceboxCsv(syntheticCsv()), DEFAULT_GRIP_SETTINGS);

describe('analyzeGripSession', () => {
  it('builds the two timed laps with metadata times and drops the out-lap', () => {
    const a = analyze();
    expect(a.laps.map((l) => l.num)).toEqual([1, 2]);
    expect(a.laps[0].time).toBeCloseTo(LAP_S - 0.5, 2);
    expect(a.laps[1].time).toBeCloseTo(LAP_S, 2);
    expect(bestLap(a.laps)).toBe(a.laps[0]);
    // lap ranges are contiguous and ordered
    expect(a.laps[0].end + 1).toBe(a.laps[1].start);
  });

  it('detects both corners per lap with the right direction and stats', () => {
    const a = analyze();
    for (const lap of a.laps) {
      expect(lap.corners.map((c) => c.dir)).toEqual(APEXES.map((x) => x.dir));
      for (const [k, c] of lap.corners.entries()) {
        expect(a.ch.t[c.ap] - a.ch.t[lap.start]).toBeCloseTo(APEXES[k].at, 0);
        expect(c.minSpeed).toBeCloseTo(BASE_SPEED - CORNER_DIP, 0);
        expect(c.maxLean).toBeGreaterThan(PEAK_LEAN - 3);
        expect(c.l).toBeLessThan(c.ap);
        expect(c.ap).toBeLessThan(c.r);
        // clean gaussian corners at 40° lean demand ≈ tan(40°) ≈ 0.84 g
        expect(c.apexG).toBeGreaterThan(0.6);
        expect(c.apexG).toBeLessThanOrEqual(c.peakG);
        expect(c.peakLoad).toBeGreaterThan(0);
      }
    }
  });

  it('produces a sane envelope, session score and projected track', () => {
    const a = analyze();
    const expectedPeak = Math.tan((PEAK_LEAN * Math.PI) / 180);
    expect(a.gref).toBeGreaterThan(expectedPeak * 0.7);
    expect(a.gref).toBeLessThan(expectedPeak * 1.3);
    // absolute session score: bigger envelope → bigger number, 100 ≈ 1 g circle
    expect(a.sessionScore).toBeGreaterThan(30);
    expect(a.sessionScore).toBeLessThan(100);
    // track spans at least a few hundred metres and projection is finite
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < a.n; i++) {
      expect(Number.isFinite(a.px[i])).toBe(true);
      minX = Math.min(minX, a.px[i]);
      maxX = Math.max(maxX, a.px[i]);
    }
    expect(maxX - minX).toBeGreaterThan(100);
  });

  it('keeps dynamic load ≥ grip demand everywhere', () => {
    const a = analyze();
    const dynC = computeCombined(a.comb, a.loadRate, DEFAULT_GRIP_SETTINGS.tau);
    for (let i = 0; i < a.n; i += 13) {
      expect(dynC[i]).toBeGreaterThanOrEqual(a.comb[i] - 1e-6);
    }
  });

  it('cornerStats against the grip metric matches the stored stats', () => {
    const a = analyze();
    const c = a.laps[0].corners[0];
    const live = cornerStats(c, a.comb);
    expect(live.apex).toBeCloseTo(c.apexG, 6);
    expect(live.peak).toBeCloseTo(c.peakG, 6);
  });
});
