import { useMemo } from 'react';
import type { CompareGrid, GripComparison } from '@/analysis/grip/compare';
import {
  distanceFrame,
  drawCursor,
  drawDistanceLabels,
  drawTurnTicks,
  niceStep,
  seekFromClick,
} from './compare-chart-frame';
import { nearestIndex } from './compare-delta-chart';
import { CANVAS_FONT, useCanvasDraw } from './use-canvas-draw';

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
export function CompareTraceChart({ cmp, channel, colorOf, keys, cursor, onSeek, height = 170 }: Props) {
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

    const step = niceStep(hi - lo, 4);
    ctx.font = `9px ${CANVAS_FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = Y(v);
      ctx.strokeStyle = Math.abs(v) < 1e-9 && spec.signed ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.055)';
      ctx.beginPath();
      ctx.moveTo(f.x0, y);
      ctx.lineTo(f.x1, y);
      ctx.stroke();
      ctx.fillStyle = '#6b6b74';
      ctx.fillText(v.toFixed(spec.dp), f.x0 - 5, y);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(spec.unit, f.x0 + 3, f.y0 + 2);

    drawTurnTicks(ctx, f, cmp.corners);

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const l of series) {
      const arr = l.grid[channel as keyof CompareGrid] as Float32Array;
      const n = Math.min(arr.length, cmp.s.length);
      ctx.strokeStyle = colorOf.get(l.key) ?? '#e4e4e7';
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
    }

    drawDistanceLabels(ctx, f);
    drawCursor(ctx, f, cursor);
    const k = nearestIndex(cmp.s, cursor);
    for (const l of series) {
      const arr = l.grid[channel as keyof CompareGrid] as Float32Array;
      const v = spec.scale(arr[k]);
      if (!measured(l, k) || Number.isNaN(v)) continue;
      ctx.fillStyle = colorOf.get(l.key) ?? '#e4e4e7';
      ctx.beginPath();
      ctx.arc(f.X(cursor), Y(v), 3, 0, 7);
      ctx.fill();
    }
  }, [cmp, series, channel, colorOf, cursor, height]);

  return (
    <canvas
      ref={ref}
      onClick={(e) => ref.current && onSeek(seekFromClick(e, ref.current, cmp.refLength))}
      className="block w-full cursor-crosshair rounded-lg bg-zinc-950"
      style={{ height }}
    />
  );
}
