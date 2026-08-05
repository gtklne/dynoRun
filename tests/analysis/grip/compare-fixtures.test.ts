// Ground-truth check against the two real RaceBox sessions. The CSVs are
// gitignored (see tests/fixtures/racebox/README.md), so these cases skip in CI
// and run locally — they are the only place the alignment is measured against
// lap times a timing system produced rather than ones we simulated.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareLaps, type CompareLapInput } from '@/analysis/grip/compare';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import type { GripAnalysis } from '@/analysis/grip/types';

const FAST = 'tests/fixtures/racebox/RaceBox Track Sessionon 06-06-2026 11-50.csv';
const LONG = 'tests/fixtures/racebox/RaceBox Track Sessionon 22-06-2026 14-27.csv';
const have = existsSync(FAST) && existsSync(LONG);

const load = (f: string) => analyzeGripSession(parseRaceboxCsv(readFileSync(f, 'utf8')), DEFAULT_GRIP_SETTINGS);
const bestLapOf = (a: GripAnalysis) => a.laps.reduce((x, y) => (y.time < x.time ? y : x));

describe.skipIf(!have)('compare on real RaceBox sessions', () => {
  it('reproduces the timing system’s lap deltas to within a few milliseconds', () => {
    const a = load(FAST);
    const best = bestLapOf(a);
    const inputs: CompareLapInput[] = a.laps.map((lap) => ({
      key: `A:${lap.num}`, label: `Lap ${lap.num}`, sessionId: 'A', analysis: a, lap, metric: a.comb,
    }));
    const cmp = compareLaps(inputs, `A:${best.num}`)!;
    expect(cmp.laps.length).toBe(10);

    for (const l of cmp.laps) {
      expect(l.verdict === 'aligned' || l.verdict === 'reference').toBe(true);
      expect(l.coverage).toBeGreaterThan(0.99);
      // the racing line varies a couple of metres lap to lap, no more
      expect(l.offP95).toBeLessThan(5);
      // geometric path length and the speed odometer agree on sound GPS; this
      // single ratio catches a wrong projection scale, a lat/lon swap and a
      // signal-reacquisition position jump
      expect(Math.abs(l.odoRatio - 1)).toBeLessThan(0.002);
      expect(l.clamps).toBe(0);
      // RaceBox's own lap time vs the delta we integrate along the shared axis.
      // Measured: mean 0.8 ms, max 1.4 ms over these ten laps. Anchoring each
      // lap's clock at its own first sample instead of at the axis zero costs
      // 39 ms — a constant per-lap bias, four units of the 0.01 s we print.
      expect(Math.abs(l.finishDelta - (l.lapTime - best.time))).toBeLessThan(0.01);
    }
  });

  it('finds one stable turn list even though per-lap detection is not stable', () => {
    const a = load(FAST);
    const inputs: CompareLapInput[] = a.laps.map((lap) => ({
      key: `A:${lap.num}`, label: `Lap ${lap.num}`, sessionId: 'A', analysis: a, lap, metric: a.comb,
    }));
    // the same physical lap yields anywhere from 6 to 9 detected corners
    const perLap = a.laps.map((l) => l.corners.length);
    expect(Math.min(...perLap)).toBeLessThan(Math.max(...perLap));

    const cmp = compareLaps(inputs, inputs[0].key)!;
    expect(cmp.corners.length).toBeGreaterThanOrEqual(6);
    // every turn is measured on every lap, including laps that missed it
    for (const c of cmp.corners) {
      expect(c.stats.length).toBe(10);
      for (const s of c.stats) expect(s.minSpeed).toBeGreaterThan(0);
    }
    for (let i = 1; i < cmp.corners.length; i++) {
      expect(cmp.corners[i].s).toBeGreaterThan(cmp.corners[i - 1].s);
    }
  });

  it('compares only the section two layouts share, and withholds a lap-time delta', () => {
    // both sessions report track "Anneau Du Rhin", configuration "Short", and
    // their start/finish fixes are within 2 m — but the laps are 2739 m and
    // 3411 m: B runs a ~690 m extension and rejoins before the line. Name
    // equality is not layout equality, and the honest answer is not a refusal
    // but the 88% of the lap that genuinely is the same track.
    const A = load(FAST);
    const B = load(LONG);
    expect(A.meta.track).toBe(B.meta.track);
    expect(A.meta.config).toBe(B.meta.config);

    const inputs: CompareLapInput[] = [
      { key: 'A', label: 'A', sessionId: 'A', analysis: A, lap: bestLapOf(A), metric: A.comb },
      { key: 'B', label: 'B', sessionId: 'B', analysis: B, lap: bestLapOf(B), metric: B.comb },
    ];
    for (const ref of ['A', 'B']) {
      const cmp = compareLaps(inputs, ref)!;
      const other = cmp.laps.find((l) => !l.isReference)!;
      expect(other.verdict).toBe('partial');
      // no lap-time delta across a partial section — that number would be a lie
      expect(Number.isNaN(other.finishDelta)).toBe(true);
      expect(Number.isFinite(other.sectionDelta)).toBe(true);
      expect(other.sectionFraction).toBeGreaterThan(0.5);
      expect(other.sectionFraction).toBeLessThan(0.98);
      // the shared stretch starts at the common start/finish straight
      expect(cmp.common.sIn).toBeLessThan(50);
      // and a cross-session datum offset was measured and removed
      expect(other.datumShiftM).toBeLessThan(5);
    }
  });
});
