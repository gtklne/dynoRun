import { useMemo } from 'react';
import type { CompareGrid, GripComparison } from '@/analysis/grip/compare';
import { usePlateInk } from '@/ui/plate';
import {
  distanceFrame,
  drawCursor,
  drawDistanceLabels,
  drawMaskedRegion,
  drawPlotFrame,
  drawTurnTicks,
  niceStep,
  seekFromClick,
} from './compare-chart-frame';
import { nearestIndex } from './compare-delta-chart';
import { plateFont, useCanvasDraw } from './use-canvas-draw';

export type TraceChannel = 'spd' | 'lean' | 'metric' | 'along';

export const TRACE_CHANNELS: { value: TraceChannel; label: string }[] = [
  { value: 'spd', label: 'Speed' },
  { value: 'lean', label: 'Lean' },
  { value: 'metric', label: 'Demand' },
  { value: 'along', label: 'Long g' },
];

interface ChannelSpec {
  unit: string;
  /** grid value → displayed value */
  scale: (v: number) => number;
  dp: number;
  /** force the axis to include zero (signed channels) */
  signed: boolean;
}

const SPEC: Record<TraceChannel, ChannelSpec> = {
  spd: { unit: 'km/h', scale: (v) => v * 3.6, dp: 0, signed: false },
  lean: { unit: '°', scale: (v) => v, dp: 0, signed: true },
  metric: { unit: 'pts', scale: (v) => v * 100, dp: 0, signed: false },
  along: { unit: 'g', scale: (v) => v, dp: 2, signed: true },
};

interface Props {
  cmp: GripComparison;
  channel: TraceChannel;
  colorOf: Map<string, string>;
  /** lap key → series dash, so identity survives a colour-blind reader */
  dashOf?: Map<string, number[]>;
  keys: string[];
  cursor: number;
  onSeek: (s: number) => void;
  height?: number;
}

// Half a metre of slack, matching compareSegments: a lap with no trailing pad
// ends at exactly the axis length to within Float32 rounding.
const SECTION_EPS = 0.5;

/**
 * Every selected lap's chosen channel on the shared distance axis, the
 * evidence behind the delta chart. Because the x axis is distance and not time,
 * two traces crossing means one rider was genuinely faster *at that point on
 * the track*, which a time axis can never show.
 *
 * A lap is drawn only across the stretch of axis it actually rode. Outside its
 * common section `resampleByDistance` holds the last real value, so drawing the
 * whole axis renders a flat line that is indistinguishable from measurement,
 * on the local fixture pair that is 12% of the axis, at a held 215 km/h.
 */
export function CompareTraceChart({ cmp, channel, colorOf, dashOf, keys, cursor, onSeek, height = 170 }: Props) {
  const ink = usePlateInk();
  // memoised so the draw deps are stable across unrelated parent renders
  const series = useMemo(() => cmp.laps.filter((l) => keys.includes(l.key)), [cmp, keys]);
  const spec = SPEC[channel];

  const ref = useCanvasDraw(({ ctx, w, h }) => {
    ctx.clearRect(0, 0, w, h);
    const f = distanceFrame(w, h, cmp.refLength);
    const measured = (l: (typeof series)[number], k: number) =>
      cmp.s[k] >= l.section.sIn - SECTION_EPS && cmp.s[k] <= l.section.sOut + SECTION_EPS;

    let lo = spec.signed ? 0 : Infinity;
    let hi = spec.signed ? 0 : -Infinity;
    for (const l of series) {
      const arr = l.grid[channel as keyof CompareGrid] as Float32Array;
      const n = Math.min(arr.length, cmp.s.length);
      for (let k = 0; k < n; k++) {
        if (!measured(l, k)) continue;
        const v = spec.scale(arr[k]);
        if (Number.isNaN(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-9) { lo = 0; hi = 1; }
    const padv = (hi - lo) * 0.08;
    lo -= padv;
    hi += padv;
    const Y = (v: number) => f.y1 - ((v - lo) / (hi - lo)) * (f.y1 - f.y0);

    // Stretches of axis at least one drawn lap never rode. Outside its section
    // `resampleByDistance` holds the last real value, so an unmarked margin is
    // a held number wearing the costume of a measurement.
    let inM = 0;
    let outM = cmp.refLength;
    for (const l of series) {
      inM = Math.max(inM, l.section.sIn);
      outM = Math.min(outM, l.section.sOut);
    }
    if (series.length) {
      if (inM > 1) drawMaskedRegion(ctx, f, ink, 0, inM);
      if (outM < cmp.refLength - 1) drawMaskedRegion(ctx, f, ink, outM, cmp.refLength);
    }

    const step = niceStep(hi - lo, 4);
    ctx.font = plateFont(9);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = Y(v);
      ctx.strokeStyle = Math.abs(v) < 1e-9 && spec.signed ? ink.rule : ink.ruleFaint;
      ctx.beginPath();
      ctx.moveTo(f.x0, y);
      ctx.lineTo(f.x1, y);
      ctx.stroke();
      ctx.fillStyle = ink.ink3;
      ctx.fillText(v.toFixed(spec.dp), f.x0 - 5, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(spec.unit.toUpperCase(), f.x0 + 3, f.y0 + 2);

    drawTurnTicks(ctx, f, cmp.corners, ink);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const l of series) {
      const arr = l.grid[channel as keyof CompareGrid] as Float32Array;
      const n = Math.min(arr.length, cmp.s.length);
      ctx.strokeStyle = colorOf.get(l.key) ?? ink.ink;
      ctx.setLineDash(dashOf?.get(l.key) ?? []);
      ctx.lineWidth = l.isReference ? 2.2 : 1.6;
      ctx.beginPath();
      let open = false;
      for (let k = 0; k < n; k++) {
        const v = spec.scale(arr[k]);
        if (!measured(l, k) || Number.isNaN(v)) { open = false; continue; }
        const x = f.X(cmp.s[k]);
        const y = Y(v);
        if (open) ctx.lineTo(x, y);
        else { ctx.moveTo(x, y); open = true; }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawPlotFrame(ctx, f, ink);
    drawDistanceLabels(ctx, f, ink);
    drawCursor(ctx, f, cursor, ink);
    const k = nearestIndex(cmp.s, cursor);
    for (const l of series) {
      const arr = l.grid[channel as keyof CompareGrid] as Float32Array;
      const v = spec.scale(arr[k]);
      if (!measured(l, k) || Number.isNaN(v)) continue;
      ctx.fillStyle = colorOf.get(l.key) ?? ink.ink;
      ctx.beginPath();
      ctx.arc(f.X(cursor), Y(v), 3, 0, 7);
      ctx.fill();
    }
  }, [cmp, series, channel, colorOf, dashOf, cursor, height, ink]);

  return (
    <canvas
      ref={ref}
      onClick={(e) => ref.current && onSeek(seekFromClick(e, ref.current, cmp.refLength))}
      className="block w-full cursor-crosshair"
      style={{ height, background: 'var(--color-sunk)' }}
    />
  );
}
