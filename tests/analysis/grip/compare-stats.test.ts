import { describe, expect, it } from 'vitest';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { compareLaps, type CompareGrid, type CompareLapInput } from '@/analysis/grip/compare';
import {
  compareSegments,
  dutyMetres,
  equalBudgetEnvelope,
  paceNote,
  resolveCompareSettings,
  sectorScores,
  turnPayoff,
} from '@/analysis/grip/compare-stats';
import { ENVELOPE_BINS, computeEnvelope } from '@/analysis/grip/envelope';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import { BASE_PACE, circuitCsv, simulateSession, type LapPace } from './synthetic-circuit';

const SLOW: LapPace = { aLat: 0.75, aAcc: 0.4, aBrk: 0.7, vMax: 52 };
const MID: LapPace = { aLat: 0.9, aAcc: 0.48, aBrk: 0.82, vMax: 58 };

function session(paces: LapPace[]) {
  const parsed = parseRaceboxCsv(circuitCsv(simulateSession(paces, 1)));
  return analyzeGripSession(parsed, DEFAULT_GRIP_SETTINGS);
}

function comparison(paces: LapPace[]) {
  const a = session(paces);
  const inputs: CompareLapInput[] = a.laps.map((lap) => ({
    key: `s:${lap.num}`, label: `Lap ${lap.num}`, sessionId: 's', analysis: a, lap, metric: a.comb,
  }));
  return { a, inputs, cmp: compareLaps(inputs, inputs[0].key)! };
}

describe('resolveCompareSettings', () => {
  it('keeps a value both sessions agree on', () => {
    const tuned = { ...DEFAULT_GRIP_SETTINGS, tau: 0.5, anchorG: 1.3 };
    const { settings, diverged } = resolveCompareSettings([tuned, { ...tuned }]);
    expect(settings.tau).toBe(0.5);
    expect(settings.anchorG).toBe(1.3);
    expect(diverged).toEqual([]);
  });

  it('falls back to the default where sessions disagree, and names the keys', () => {
    const { settings, diverged } = resolveCompareSettings([
      { ...DEFAULT_GRIP_SETTINGS, speedSmooth: 5, tau: 0.5 },
      { ...DEFAULT_GRIP_SETTINGS, speedSmooth: 15, tau: 0.5 },
    ]);
    expect(settings.speedSmooth).toBe(DEFAULT_GRIP_SETTINGS.speedSmooth);
    expect(settings.tau).toBe(0.5);
    expect(diverged).toEqual(['speedSmooth']);
  });

  it('does not depend on the order the sessions were added', () => {
    const a = { ...DEFAULT_GRIP_SETTINGS, envMinSpeed: 25 };
    const b = { ...DEFAULT_GRIP_SETTINGS, envMinSpeed: 40 };
    expect(resolveCompareSettings([a, b])).toEqual(resolveCompareSettings([b, a]));
  });

  it('treats a session with no stored settings as defaults', () => {
    const { settings, diverged } = resolveCompareSettings([null, undefined]);
    expect(settings).toEqual(DEFAULT_GRIP_SETTINGS);
    expect(diverged).toEqual([]);
  });
});

describe('sectorScores', () => {
  it('splits a circular envelope into four equal quadrant scores', () => {
    const env = new Float32Array(ENVELOPE_BINS).fill(0.9);
    const s = sectorScores(env);
    for (const v of [s.brake, s.right, s.accel, s.left]) expect(v).toBeCloseTo(90, 4);
  });

  it('uses 18 bins per quadrant and separates a lopsided envelope', () => {
    const env = new Float32Array(ENVELOPE_BINS).fill(0.5);
    // theta = atan2(along, alat), so +pi/2 is pure drive → bins 45..62
    for (let b = 45; b <= 62; b++) env[b] = 1.2;
    const s = sectorScores(env);
    expect(s.accel).toBeCloseTo(120, 4);
    expect(s.brake).toBeCloseTo(50, 4);
    expect(s.left).toBeCloseTo(50, 4);
    expect(s.right).toBeCloseTo(50, 4);
  });
});

describe('equalBudgetEnvelope', () => {
  it('matches the plain fit when the budget covers every lap', () => {
    const a = session([BASE_PACE, MID]);
    const full = computeEnvelope(a, DEFAULT_GRIP_SETTINGS, a.ch.lap);
    const budgeted = equalBudgetEnvelope(a, DEFAULT_GRIP_SETTINGS, a.laps.length);
    expect(budgeted.sessionScore).toBeCloseTo(full.sessionScore, 4);
  });

  it('returns the median single-lap fit, never an average of fits', () => {
    const a = session([BASE_PACE, MID, SLOW]);
    expect(a.laps.length).toBe(3);
    const perLap = a.laps.map((lap) => {
      const mask = new Int32Array(a.n);
      for (let i = lap.start; i <= lap.end; i++) mask[i] = lap.num;
      return computeEnvelope(a, DEFAULT_GRIP_SETTINGS, mask).sessionScore;
    });
    const median = [...perLap].sort((x, y) => x - y)[1];
    const budgeted = equalBudgetEnvelope(a, DEFAULT_GRIP_SETTINGS, 1);
    expect(budgeted.sessionScore).toBeCloseTo(median, 4);
    // and the ring it returns is that same fit, bin for bin
    expect(perLap).toContain(budgeted.sessionScore);
  });

  it('clamps a budget bigger than the session and survives one lap', () => {
    const a = session([BASE_PACE]);
    expect(equalBudgetEnvelope(a, DEFAULT_GRIP_SETTINGS, 99).sessionScore).toBeGreaterThan(0);
    expect(equalBudgetEnvelope(a, DEFAULT_GRIP_SETTINGS, 0).sessionScore).toBeGreaterThan(0);
  });

  it('a faster session scores above a slower one at equal lap budget', () => {
    const fast = session([BASE_PACE, BASE_PACE]);
    const slow = session([SLOW, SLOW]);
    const f = equalBudgetEnvelope(fast, DEFAULT_GRIP_SETTINGS, 2).sessionScore;
    const s = equalBudgetEnvelope(slow, DEFAULT_GRIP_SETTINGS, 2).sessionScore;
    expect(f).toBeGreaterThan(s + 5);
  });
});

describe('compareSegments', () => {
  it('tiles the lap so segment times sum to each lap’s duration', () => {
    const { cmp } = comparison([BASE_PACE, MID]);
    const br = compareSegments(cmp);
    expect(br.segments.length).toBe(cmp.corners.length);
    expect(br.segments[0].sStart).toBe(0);
    expect(br.segments[br.segments.length - 1].sEnd).toBeCloseTo(cmp.refLength, 4);
    for (let i = 1; i < br.segments.length; i++) {
      expect(br.segments[i].sStart).toBeCloseTo(br.segments[i - 1].sEnd, 6);
    }
    for (const lap of cmp.laps) {
      const total = br.totals.find((t) => t.key === lap.key)!;
      expect(total.time).toBeCloseTo(lap.grid.t[lap.grid.t.length - 1], 3);
    }
  });

  it('joins the best of each segment into a lap no slower than the best real lap', () => {
    const { cmp } = comparison([BASE_PACE, MID, SLOW]);
    const br = compareSegments(cmp);
    const bestReal = Math.min(...br.totals.map((t) => t.time));
    expect(br.theoreticalBest).toBeLessThanOrEqual(bestReal + 1e-6);
    expect(br.bestLapKey).toBe(br.totals.find((t) => t.time === bestReal)!.key);
    for (const seg of br.segments) {
      expect(seg.times.find((t) => t.key === seg.bestKey)!.loss).toBe(0);
      for (const t of seg.times) expect(t.loss).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces a single sector when no turns were found', () => {
    const { cmp } = comparison([BASE_PACE, MID]);
    const br = compareSegments({ ...cmp, corners: [] });
    expect(br.segments.length).toBe(1);
    expect(br.segments[0].turn).toBeNull();
    expect(br.segments[0].label).toBe('Sector 1');
  });
});

function gridOf(n: number, fill: Partial<Record<'along' | 'comb' | 'lean', number>>): CompareGrid {
  const mk = (v = 0) => new Float32Array(n).fill(v);
  return {
    t: mk(), dt: mk(), spd: mk(), lean: mk(fill.lean), alat: mk(),
    along: mk(fill.along), comb: mk(fill.comb), loadRate: mk(), metric: mk(),
    x: mk(), y: mk(), off: mk(),
  };
}

describe('dutyMetres', () => {
  const s = new Float32Array(101);
  for (let i = 0; i <= 100; i++) s[i] = i * 10; // 1000 m in 10 m steps

  it('accounts for every metre exactly once', () => {
    const d = dutyMetres(s, gridOf(101, { along: 0.4 }));
    expect(d.total).toBeCloseTo(1000, 6);
    expect(d.brake + d.coast + d.drive).toBeCloseTo(d.total, 6);
    expect(d.drive).toBeCloseTo(1000, 6);
    expect(d.brake).toBe(0);
  });

  it('reads a steady coast as coasting, not driving', () => {
    // `along` is the drag-corrected tire demand, so a true coast sits at 0
    const d = dutyMetres(s, gridOf(101, { along: 0.02 }));
    expect(d.coast).toBeCloseTo(1000, 6);
    expect(d.drive).toBe(0);
  });

  it('counts braking metres and the hard-g and lean bands', () => {
    const d = dutyMetres(s, gridOf(101, { along: -0.9, comb: 1.1, lean: -48 }));
    expect(d.brake).toBeCloseTo(1000, 6);
    expect(d.aboveG).toBeCloseTo(1000, 6);
    expect(d.aboveLean).toBeCloseTo(1000, 6);
  });

  it('respects overridden thresholds', () => {
    const d = dutyMetres(s, gridOf(101, { comb: 0.9, lean: 30 }), { gThreshold: 1.0, leanThreshold: 20 });
    expect(d.aboveG).toBe(0);
    expect(d.aboveLean).toBeCloseTo(1000, 6);
  });
});

describe('turnPayoff', () => {
  it('separates the four ways a turn can differ', () => {
    expect(turnPayoff(-0.3, +8)).toBe('faster-more-g');
    expect(turnPayoff(-0.3, 0)).toBe('faster-other');
    expect(turnPayoff(+0.3, -8)).toBe('slower-backed-off');
    expect(turnPayoff(+0.3, 0)).toBe('slower-despite-g');
  });

  it('calls a turn level only when both deltas are inside the noise band', () => {
    expect(turnPayoff(0.01, 1)).toBe('level');
    expect(turnPayoff(0.01, 9)).toBe('level');
    expect(turnPayoff(0.2, 1)).toBe('slower-despite-g');
  });

  it('honours custom thresholds', () => {
    expect(turnPayoff(0.1, 0, { time: 0.5 })).toBe('level');
    expect(turnPayoff(-0.3, 4, { score: 10 })).toBe('faster-other');
  });
});

describe('paceNote', () => {
  it('reports pace rather than lap time when the layouts differ in length', () => {
    const { cmp } = comparison([BASE_PACE, MID]);
    const ref = cmp.laps[0];
    const other = cmp.laps[1];
    const note = paceNote(ref, other);
    expect(Math.abs(note.lengthDeltaM)).toBeLessThan(30);
    // the slower pace must show up as a negative percentage
    expect(note.pacePct).toBeLessThan(0);
    expect(note.refPace).toBeGreaterThan(note.subjectPace);
  });
});
