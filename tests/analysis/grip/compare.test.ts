import { describe, expect, it } from 'vitest';
import { compareLaps, type CompareLapInput } from '@/analysis/grip/compare';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import type { GripAnalysis } from '@/analysis/grip/types';
import { BASE_PACE, circuitCsv, simulateSession, type LapPace } from './synthetic-circuit';

const SLOWER: LapPace = { aLat: 0.9, aAcc: 0.48, aBrk: 0.82, vMax: 58 };
const WIDE_LINE: LapPace = { ...BASE_PACE, lineOffset: 4 };

function circuitSession(paces: LapPace[], sessionId = 's') {
  const sim = simulateSession(paces, 1);
  const parsed = parseRaceboxCsv(circuitCsv(sim));
  const analysis = analyzeGripSession(parsed, DEFAULT_GRIP_SETTINGS);
  return { sim, parsed, analysis, sessionId };
}

function inputsFor(analysis: GripAnalysis, sessionId = 's'): CompareLapInput[] {
  return analysis.laps.map((lap) => ({
    key: `${sessionId}:${lap.num}`,
    label: `Lap ${lap.num}`,
    sessionId,
    analysis,
    lap,
    metric: analysis.comb,
  }));
}

describe('compareLaps', () => {
  it('reads the cumulative delta at the finish as the lap-time difference, to a few ms', () => {
    const { sim, analysis } = circuitSession([BASE_PACE, SLOWER]);
    const inputs = inputsFor(analysis);
    expect(inputs.length).toBe(2);
    const cmp = compareLaps(inputs, inputs[0].key)!;

    const fast = cmp.laps[0];
    const slow = cmp.laps[1];
    expect(fast.isReference).toBe(true);
    expect(fast.verdict).toBe('reference');
    expect(slow.verdict).toBe('aligned');

    expect(fast.grid.dt.every((v) => v === 0)).toBe(true);
    expect(slow.grid.dt[0]).toBeCloseTo(0, 6);

    // the spatial anchor removes the lap-boundary quantisation that otherwise
    // leaves a constant per-lap bias of up to one sample period
    const truth = sim.lapTimes[1] - sim.lapTimes[0];
    expect(truth).toBeGreaterThan(1);
    expect(Math.abs(slow.finishDelta - truth)).toBeLessThan(0.02);

    // a uniformly slower lap loses time everywhere and never gains it back
    for (let k = 1; k < slow.grid.dt.length; k++) {
      expect(slow.grid.dt[k]).toBeGreaterThanOrEqual(slow.grid.dt[k - 1] - 0.02);
    }
  });

  it('holds the shared axis to the reference lap', () => {
    const { analysis } = circuitSession([BASE_PACE, SLOWER]);
    const inputs = inputsFor(analysis);
    const cmp = compareLaps(inputs, inputs[0].key)!;
    expect(cmp.refKey).toBe(inputs[0].key);
    expect(cmp.s[0]).toBe(0);
    expect(cmp.s[cmp.s.length - 1]).toBeCloseTo(cmp.refLength, 4);
    // 2 m stations: 5 m would cost up to 12 ms of interpolation error at the
    // slowest point of the lap
    expect(cmp.s[1] - cmp.s[0]).toBeLessThanOrEqual(2.01);
    for (const lap of cmp.laps) {
      expect(lap.grid.t.length).toBe(cmp.s.length);
      expect(lap.grid.metric.length).toBe(cmp.s.length);
    }
  });

  it('reports sound GPS quality flags for a clean lap', () => {
    const { analysis } = circuitSession([BASE_PACE, SLOWER]);
    const cmp = compareLaps(inputsFor(analysis), 's:1')!;
    for (const l of cmp.laps) {
      expect(Math.abs(l.odoRatio - 1)).toBeLessThan(0.005);
      expect(l.maxGapM).toBeLessThan(10);
      expect(l.datumShiftM).toBe(0); // same session: never fit a datum
      expect(l.sectionFraction).toBeGreaterThan(0.98);
    }
  });

  it('numbers turns along the reference and measures every lap in the same window', () => {
    const { analysis } = circuitSession([BASE_PACE, SLOWER, WIDE_LINE]);
    const inputs = inputsFor(analysis);
    const cmp = compareLaps(inputs, inputs[0].key)!;

    expect(cmp.corners.length).toBeGreaterThan(2);
    cmp.corners.forEach((c, i) => {
      expect(c.turn).toBe(i + 1);
      if (i > 0) expect(c.s).toBeGreaterThan(cmp.corners[i - 1].s);
      expect(c.sOut).toBeGreaterThan(c.sIn);
      expect(c.stats.length).toBe(3);
      expect(c.stats.map((s) => s.key)).toEqual(inputs.map((i2) => i2.key));
      for (const s of c.stats) expect(s.measured).toBe(true);
    });

    for (const c of cmp.corners) {
      const fast = c.stats[0];
      const slow = c.stats[1];
      expect(slow.minSpeed).toBeLessThan(fast.minSpeed);
      expect(slow.apexScore).toBeLessThan(fast.apexScore);
      expect(slow.deltaGain).toBeGreaterThan(-0.05);
    }
  });

  it('masks the delta outside a partial lap’s common section instead of clamping it', () => {
    // a clamped projection dumps the whole divergence into a few metres of axis
    // and produces a delta an order of magnitude wrong; NaN fails loudly instead
    const { parsed, analysis } = circuitSession([BASE_PACE, BASE_PACE]);
    const subLap = analysis.laps[1];
    const from = subLap.start + Math.floor(0.78 * (subLap.end - subLap.start));
    for (let i = from; i <= subLap.end; i++) parsed.ch.lat[i] += 0.0009;
    const shifted = analyzeGripSession(parsed, DEFAULT_GRIP_SETTINGS);

    const inputs = inputsFor(shifted);
    const cmp = compareLaps(inputs, inputs[0].key)!;
    const partial = cmp.laps[1];
    expect(partial.verdict).toBe('partial');
    expect(Number.isNaN(partial.finishDelta)).toBe(true);
    expect(Number.isFinite(partial.sectionDelta)).toBe(true);
    expect(partial.grid.dt.some((v) => Number.isNaN(v))).toBe(true);
    // the section that IS shared still carries a finite delta
    const k0 = Math.round((partial.section.sIn / cmp.refLength) * (cmp.s.length - 1));
    expect(Number.isFinite(partial.grid.dt[k0 + 1])).toBe(true);
    expect(cmp.common.sOut).toBeLessThan(cmp.refLength * 0.95);
  });

  it('calls a genuinely different layout incompatible', () => {
    const base = circuitSession([BASE_PACE, BASE_PACE], 'a');
    const other = circuitSession([BASE_PACE, BASE_PACE], 'b');
    // same shape scaled 1.3x: a plausible "same track name, longer
    // configuration", which is exactly what the two real fixtures are
    for (let i = 0; i < other.parsed.n; i++) {
      other.parsed.ch.lat[i] = 47.5 + (other.parsed.ch.lat[i] - 47.5) * 1.3;
      other.parsed.ch.lon[i] = 7.5 + (other.parsed.ch.lon[i] - 7.5) * 1.3;
    }
    const otherAnalysis = analyzeGripSession(other.parsed, DEFAULT_GRIP_SETTINGS);

    const inputs: CompareLapInput[] = [
      { key: 'a:1', label: 'A lap 1', sessionId: 'a', analysis: base.analysis, lap: base.analysis.laps[0], metric: base.analysis.comb },
      { key: 'b:1', label: 'B lap 1', sessionId: 'b', analysis: otherAnalysis, lap: otherAnalysis.laps[0], metric: otherAnalysis.comb },
    ];
    const cmp = compareLaps(inputs, 'a:1')!;
    expect(cmp.laps[1].verdict).toBe('incompatible');
    expect(cmp.laps[1].lengthRatio).toBeGreaterThan(1.2);
    expect(Number.isNaN(cmp.laps[1].finishDelta)).toBe(true);
    // its corners must not seed phantom turns on the reference axis
    for (const c of cmp.corners) expect(c.support).toBeLessThanOrEqual(1);
  });

  it('fits a datum offset across sessions but never inside one', () => {
    const a = circuitSession([BASE_PACE, BASE_PACE], 'a');
    const b = circuitSession([BASE_PACE, BASE_PACE], 'b');
    // a sub-metre absolute position bias, as two receivers on two days produce
    for (let i = 0; i < b.parsed.n; i++) {
      b.parsed.ch.lat[i] += 0.8 / 111189;
      b.parsed.ch.lon[i] += -0.6 / 74700;
    }
    const bAnalysis = analyzeGripSession(b.parsed, DEFAULT_GRIP_SETTINGS);
    const inputs: CompareLapInput[] = [
      { key: 'a:1', label: 'A', sessionId: 'a', analysis: a.analysis, lap: a.analysis.laps[0], metric: a.analysis.comb },
      { key: 'a:2', label: 'A2', sessionId: 'a', analysis: a.analysis, lap: a.analysis.laps[1], metric: a.analysis.comb },
      { key: 'b:1', label: 'B', sessionId: 'b', analysis: bAnalysis, lap: bAnalysis.laps[0], metric: bAnalysis.comb },
    ];
    const cmp = compareLaps(inputs, 'a:1')!;
    expect(cmp.laps.find((l) => l.key === 'a:2')!.datumShiftM).toBe(0);
    const cross = cmp.laps.find((l) => l.key === 'b:1')!;
    expect(cross.datumShiftM).toBeGreaterThan(0.3);
    expect(cross.datumShiftM).toBeLessThan(2);
    expect(cross.verdict).toBe('aligned');
  });

  it('returns null for an empty selection and survives a single lap', () => {
    expect(compareLaps([], 'x')).toBeNull();
    const { analysis } = circuitSession([BASE_PACE]);
    const inputs = inputsFor(analysis);
    const cmp = compareLaps(inputs, inputs[0].key)!;
    expect(cmp.laps.length).toBe(1);
    expect(cmp.laps[0].finishDelta).toBe(0);
    expect(cmp.corners.length).toBeGreaterThan(0);
    for (const c of cmp.corners) expect(c.support).toBe(1);
  });

  it('falls back to the first lap when the reference key is unknown', () => {
    const { analysis } = circuitSession([BASE_PACE, SLOWER]);
    const inputs = inputsFor(analysis);
    expect(compareLaps(inputs, 'nope')!.refKey).toBe(inputs[0].key);
  });

  it('gives the same axis whichever lap is the reference, up to its own line', () => {
    const { analysis } = circuitSession([BASE_PACE, SLOWER]);
    const inputs = inputsFor(analysis);
    const a = compareLaps(inputs, 's:1')!;
    const b = compareLaps(inputs, 's:2')!;
    // reversing the reference must reverse the sign of the delta, not change it
    expect(a.laps[1].finishDelta).toBeCloseTo(-b.laps[0].finishDelta, 1);
  });
});
