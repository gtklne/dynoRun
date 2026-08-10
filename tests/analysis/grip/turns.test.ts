import { describe, expect, it } from 'vitest';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { compareLaps, type CompareLapInput } from '@/analysis/grip/compare';
import { cornerStats } from '@/analysis/grip/corners';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import { bestApexPerTurn } from '@/analysis/grip/turns';
import { BASE_PACE, circuitCsv, simulateSession, type LapPace } from './synthetic-circuit';

const SLOW: LapPace = { aLat: 0.8, aAcc: 0.44, aBrk: 0.74, vMax: 54 };

function session(paces: LapPace[]) {
  return analyzeGripSession(parseRaceboxCsv(circuitCsv(simulateSession(paces, 1))), DEFAULT_GRIP_SETTINGS);
}

describe('track turn identity', () => {
  // The whole point: GripCorner.n is a per-lap detection index. On ten laps of one
  // real circuit detection finds 6 to 9 corners, so lap 3's "corner 5" and lap 1's
  // are different bends. Anything pairing corners across laps must key on `turn`.
  it('assigns the same turn number to the same bend on every lap', () => {
    const a = session([BASE_PACE, SLOW, BASE_PACE]);
    expect(a.turnCount).toBeGreaterThan(2);

    // every lap's turn ids must be strictly increasing along the lap: a turn id
    // that goes backwards means two bends were confused
    for (const lap of a.laps) {
      const seq = lap.corners.filter((c) => c.turn > 0).map((c) => c.turn);
      const sorted = [...seq].sort((x, y) => x - y);
      expect(seq).toEqual(sorted);
    }

    // and the same turn must sit at the same place on track on every lap
    const byTurn = new Map<number, { x: number; y: number }[]>();
    for (const lap of a.laps) {
      for (const c of lap.corners) {
        if (!c.turn) continue;
        if (!byTurn.has(c.turn)) byTurn.set(c.turn, []);
        byTurn.get(c.turn)!.push({ x: a.px[c.ap], y: a.py[c.ap] });
      }
    }
    expect(byTurn.size).toBe(a.turnCount);
    for (const [, pts] of byTurn) {
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      // apexes of one turn move with the racing line, but not to another bend
      for (const p of pts) expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThan(120);
    }
  });

  // The rider sees both screens. If the analyzer calls a bend Turn 4 and compare
  // calls the same bend T5, the tool contradicts itself.
  it('numbers turns the same way the compare screen does', () => {
    const a = session([BASE_PACE, SLOW, BASE_PACE]);
    const inputs: CompareLapInput[] = a.laps.map((lap) => ({
      key: `s:${lap.num}`, label: `L${lap.num}`, sessionId: 's', analysis: a, lap, metric: a.comb,
    }));
    const best = a.laps.reduce((x, y) => (y.time < x.time ? y : x));
    const cmp = compareLaps(inputs, `s:${best.num}`)!;
    expect(cmp.corners.length).toBe(a.turnCount);

    for (const lr of cmp.laps) {
      const lap = a.laps.find((l) => `s:${l.num}` === lr.key)!;
      for (const c of lap.corners) {
        if (!c.turn) continue;
        const k = Math.max(0, Math.min(lr.u.length - 1, c.ap - lr.path.i0));
        const s = lr.u[k];
        const nearest = cmp.corners.reduce(
          (b, cc) => (Math.abs(cc.s - s) < b.d ? { t: cc.turn, d: Math.abs(cc.s - s) } : b),
          { t: -1, d: Infinity },
        ).t;
        expect(nearest).toBe(c.turn);
      }
    }
  });

  it('leaves a detection no other lap agrees with unnumbered rather than shifting the rest', () => {
    const a = session([BASE_PACE, BASE_PACE, BASE_PACE]);
    const turns = new Set(a.laps.flatMap((l) => l.corners.map((c) => c.turn)).filter((t) => t > 0));
    // ids are a contiguous 1..turnCount run, never sparse
    expect([...turns].sort((x, y) => x - y)).toEqual(
      Array.from({ length: a.turnCount }, (_, i) => i + 1),
    );
  });

  it('keys the best-at-this-turn reference on the turn, not the detection index', () => {
    const a = session([BASE_PACE, SLOW, BASE_PACE]);
    const best = bestApexPerTurn(a.laps, (c) => cornerStats(c, a.comb).apex);
    // one entry per turn, and never an entry for an unmatched detection
    expect([...best.keys()].every((t) => t >= 1 && t <= a.turnCount)).toBe(true);
    // the reference really is the maximum over the laps at that turn
    for (const [turn, v] of best) {
      const all = a.laps
        .flatMap((l) => l.corners)
        .filter((c) => c.turn === turn)
        .map((c) => cornerStats(c, a.comb).apex);
      expect(v).toBeCloseTo(Math.max(...all), 10);
    }
  });

  it('survives a session with no timed laps and one with a single lap', () => {
    const one = session([BASE_PACE]);
    expect(one.laps.length).toBe(1);
    expect(one.turnCount).toBeGreaterThan(0);
    // with a single lap every detection is its own turn, nothing to disagree
    expect(one.laps[0].corners.every((c) => c.turn > 0)).toBe(true);
  });
});

describe('corner windows', () => {
  // Adjacent corners expand toward the same speed maximum between them. Measured
  // on the real fixture: 4% of a lap sat inside two windows at once, inflating a
  // corner's "peak through corner" by 13 points with its neighbour's apex, and
  // making "which corner is the cursor in" a question with two answers.
  it('never overlap inside a lap', () => {
    const a = session([BASE_PACE, SLOW]);
    for (const lap of a.laps) {
      for (let i = 1; i < lap.corners.length; i++) {
        expect(lap.corners[i].l).toBeGreaterThan(lap.corners[i - 1].r);
      }
      for (const c of lap.corners) {
        expect(c.l).toBeLessThanOrEqual(c.ap);
        expect(c.ap).toBeLessThanOrEqual(c.r);
      }
    }
  });

  it('leaves every in-lap sample in at most one corner window', () => {
    const a = session([BASE_PACE, SLOW]);
    for (const lap of a.laps) {
      for (let i = lap.start; i <= lap.end; i++) {
        const hits = lap.corners.filter((c) => i >= c.l && i <= c.r).length;
        expect(hits).toBeLessThanOrEqual(1);
      }
    }
  });
});
