// jsdom gives every element a zero-size bounding box, so useCanvasDraw's
// fitCanvas bails and NONE of the canvas draw code runs in a normal component
// test. That hides real errors — a bad index, a NaN reaching a gradient stop.
// Forcing a size makes every draw path execute against the stub 2d context.
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { compareLaps, type CompareLapInput, type GripComparison } from '@/analysis/grip/compare';
import { equalBudgetEnvelope } from '@/analysis/grip/compare-stats';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import { CompareDeltaChart } from '@/ui/grip/compare-delta-chart';
import { CompareEnvelopes } from '@/ui/grip/compare-envelopes';
import { CompareTraceChart, TRACE_CHANNELS } from '@/ui/grip/compare-trace-chart';
import { CompareTrackMap } from '@/ui/grip/compare-track-map';
import { seriesColor } from '@/ui/grip/compare-colors';
import { BASE_PACE, circuitCsv, simulateSession, type LapPace } from '../analysis/grip/synthetic-circuit';

const SLOW: LapPace = { aLat: 0.8, aAcc: 0.44, aBrk: 0.74, vMax: 54 };

let origRect: () => DOMRect;
beforeAll(() => {
  origRect = HTMLCanvasElement.prototype.getBoundingClientRect;
  HTMLCanvasElement.prototype.getBoundingClientRect = function (): DOMRect {
    return { x: 0, y: 0, width: 800, height: 300, top: 0, left: 0, right: 800, bottom: 300, toJSON: () => ({}) } as DOMRect;
  };
});
afterAll(() => {
  HTMLCanvasElement.prototype.getBoundingClientRect = origRect;
});

function build(paces: LapPace[], mutate?: (parsed: ReturnType<typeof parseRaceboxCsv>) => void) {
  const parsed = parseRaceboxCsv(circuitCsv(simulateSession(paces, 1)));
  mutate?.(parsed);
  const a = analyzeGripSession(parsed, DEFAULT_GRIP_SETTINGS);
  const inputs: CompareLapInput[] = a.laps.map((lap) => ({
    key: `s:${lap.num}`, label: `Lap ${lap.num}`, sessionId: 's', analysis: a, lap, metric: a.comb,
  }));
  return { analysis: a, cmp: compareLaps(inputs, inputs[0].key)! };
}

function colorsFor(cmp: GripComparison) {
  return new Map(cmp.laps.map((l, i) => [l.key, seriesColor(i)]));
}

describe('compare canvases draw without throwing', () => {
  const errors: unknown[][] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args); });

  function expectClean() {
    expect(errors).toEqual([]);
    errors.length = 0;
  }

  it('draws the delta chart, trace chart, map and envelopes for a clean comparison', () => {
    const { analysis, cmp } = build([BASE_PACE, SLOW]);
    const colorOf = colorsFor(cmp);
    const keys = cmp.laps.map((l) => l.key);
    const subject = cmp.laps.find((l) => !l.isReference)!.key;

    render(<CompareDeltaChart cmp={cmp} colorOf={colorOf} keys={keys} cursor={500} onSeek={() => {}} />);
    render(<CompareTrackMap cmp={cmp} subjectKey={subject} colorOf={colorOf} cursor={500} onSeek={() => {}} />);
    for (const c of TRACE_CHANNELS) {
      render(<CompareTraceChart cmp={cmp} channel={c.value} colorOf={colorOf} keys={keys} cursor={500} onSeek={() => {}} />);
    }
    const env = equalBudgetEnvelope(analysis, DEFAULT_GRIP_SETTINGS, 1);
    render(<CompareEnvelopes series={[{ key: 's', label: 'S', env: env.env, color: '#4c95ec' }]} anchorG={1.1} />);
    expectClean();
    cleanup();
  });

  it('draws a comparison whose delta channel is masked by a partial section', () => {
    // NaN in the delta channel is the honest signal that a lap left the layout;
    // every renderer has to survive it rather than plot it as zero
    const { cmp } = build([BASE_PACE, BASE_PACE], (parsed) => {
      const half = Math.floor(parsed.n / 2);
      for (let i = half + 300; i < parsed.n; i++) {
        parsed.ch.lat[i] = 47.5 + (parsed.ch.lat[i] - 47.5) * 1.3;
        parsed.ch.lon[i] = 7.5 + (parsed.ch.lon[i] - 7.5) * 1.3;
      }
    });
    expect(cmp.laps.some((l) => l.grid.dt.some(Number.isNaN))).toBe(true);
    const colorOf = colorsFor(cmp);
    const keys = cmp.laps.map((l) => l.key);
    render(<CompareDeltaChart cmp={cmp} colorOf={colorOf} keys={keys} cursor={0} onSeek={() => {}} />);
    render(<CompareTrackMap cmp={cmp} subjectKey={cmp.laps[1].key} colorOf={colorOf} cursor={9e9} onSeek={() => {}} />);
    render(<CompareTraceChart cmp={cmp} channel="spd" colorOf={colorOf} keys={keys} cursor={0} onSeek={() => {}} />);
    expectClean();
    cleanup();
  });

  it('draws a single-lap comparison, where there is no series to plot', () => {
    const { cmp } = build([BASE_PACE]);
    const colorOf = colorsFor(cmp);
    render(<CompareDeltaChart cmp={cmp} colorOf={colorOf} keys={[]} cursor={0} onSeek={() => {}} />);
    render(<CompareTrackMap cmp={cmp} subjectKey="" colorOf={colorOf} cursor={0} onSeek={() => {}} />);
    render(<CompareTraceChart cmp={cmp} channel="lean" colorOf={colorOf} keys={cmp.laps.map((l) => l.key)} cursor={0} onSeek={() => {}} />);
    render(<CompareEnvelopes series={[]} anchorG={1.1} />);
    expectClean();
    cleanup();
    spy.mockRestore();
  });
});
