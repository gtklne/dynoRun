// The session analyzer's three canvases (track map, traction circle, load
// timeline) had never executed a single draw statement anywhere: jsdom reports a
// zero-size bounding box, so useCanvasDraw's fitCanvas bails and every draw is
// skipped. Forcing a size makes the real draw code run, and counting the calls
// makes a skipped draw a failure rather than a silent pass.
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { computeCombined } from '@/analysis/grip/load';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { LoadTimeline } from '@/ui/grip/load-timeline';
import { TrackMap } from '@/ui/grip/track-map';
import { TractionCircle } from '@/ui/grip/traction-circle';
import { BASE_PACE, circuitCsv, simulateSession } from '../analysis/grip/synthetic-circuit';

let origRect: () => DOMRect;
let origGetContext: HTMLCanvasElement['getContext'];
const calls: Record<string, number> = {};
const reset = () => { for (const k of Object.keys(calls)) delete calls[k]; };

beforeAll(() => {
  origRect = HTMLCanvasElement.prototype.getBoundingClientRect;
  HTMLCanvasElement.prototype.getBoundingClientRect = function (): DOMRect {
    return { x: 0, y: 0, width: 600, height: 400, top: 0, left: 0, right: 600, bottom: 400, toJSON: () => ({}) } as DOMRect;
  };
  origGetContext = HTMLCanvasElement.prototype.getContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLCanvasElement.prototype as any).getContext = function (...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (origGetContext as any).apply(this, args);
    if (!ctx) return ctx;
    return new Proxy(ctx, {
      get(target, prop) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = (target as any)[prop];
        if (typeof v !== 'function') return v;
        return (...a: unknown[]) => {
          // a NaN reaching a coordinate is the failure mode these tests exist for
          for (const arg of a) {
            if (typeof arg === 'number' && !Number.isFinite(arg)) {
              throw new Error(`${String(prop)} received a non-finite argument: ${arg}`);
            }
          }
          calls[String(prop)] = (calls[String(prop)] ?? 0) + 1;
          return v.apply(target, a);
        };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(target, prop, value) { (target as any)[prop] = value; return true; },
    });
  };
});
afterAll(() => {
  HTMLCanvasElement.prototype.getBoundingClientRect = origRect;
  HTMLCanvasElement.prototype.getContext = origGetContext;
});

function build(mutate?: (p: ReturnType<typeof parseRaceboxCsv>) => void) {
  const parsed = parseRaceboxCsv(circuitCsv(simulateSession([BASE_PACE, BASE_PACE], 1)));
  mutate?.(parsed);
  const analysis = analyzeGripSession(parsed, DEFAULT_GRIP_SETTINGS);
  const metric = computeCombined(analysis.comb, analysis.loadRate, DEFAULT_GRIP_SETTINGS.tau);
  return { analysis, metric };
}

function renderAll(analysis: GripAnalysis, lap: GripLap, metric: Float32Array, cursor: number) {
  const apex = new Map(lap.corners.map((c) => [c.n, analysis.comb[c.ap]]));
  render(
    <TrackMap
      analysis={analysis} lap={lap} cursor={cursor} metric={metric}
      cornerApexG={apex} anchorG={1.1} onSeek={() => {}}
    />,
  );
  render(
    <TractionCircle
      analysis={analysis} lap={lap} cursor={cursor} metric={metric} rateFS={3} anchorG={1.1}
    />,
  );
  render(
    <LoadTimeline analysis={analysis} lap={lap} cursor={cursor} rateFS={3} onSeek={() => {}} />,
  );
}

describe('session canvases draw', () => {
  const errors: unknown[][] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a); });

  function expectDrew() {
    expect(errors).toEqual([]);
    errors.length = 0;
    expect(calls.stroke ?? 0).toBeGreaterThan(10);
    expect(calls.beginPath ?? 0).toBeGreaterThan(10);
    reset();
  }

  it('paints a clean session at the start, middle and end of a lap', () => {
    const { analysis, metric } = build();
    const lap = analysis.laps[0];
    for (const cursor of [0, Math.floor((lap.end - lap.start) / 2), lap.end - lap.start]) {
      renderAll(analysis, lap, metric, cursor);
      expectDrew();
      cleanup();
    }
  });

  it('paints a lap whose corner detection found nothing', () => {
    const { analysis, metric } = build();
    const bare: GripLap = { ...analysis.laps[0], corners: [] };
    renderAll(analysis, bare, metric, 5);
    expectDrew();
    cleanup();
  });

  // A one-sample lap makes the load timeline's k/(n-1) divide by zero; a zero-g
  // session leaves the traction circle with nothing to scale to.
  it('paints degenerate laps without emitting a non-finite coordinate', () => {
    const { analysis, metric } = build();
    const single: GripLap = { ...analysis.laps[0], end: analysis.laps[0].start, corners: [] };
    renderAll(analysis, single, metric, 0);
    expectDrew();
    cleanup();

    const flat = build((p) => {
      for (let i = 0; i < p.n; i++) { p.ch.spd[i] = 0; p.ch.lean[i] = 0; }
    });
    renderAll(flat.analysis, flat.analysis.laps[0], flat.metric, 3);
    expectDrew();
    cleanup();
    spy.mockRestore();
  });
});
