import { useMemo } from 'react';
import type { GripComparison } from '@/analysis/grip/compare';
import { usePlateInk } from '@/ui/plate';
import { deltaColor } from './compare-colors';
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
import { plateFont, useCanvasDraw } from './use-canvas-draw';

interface Props {
  cmp: GripComparison;
  /** lap key → series colour */
  colorOf: Map<string, string>;
  /** lap key → series dash, so identity survives a colour-blind reader */
  dashOf?: Map<string, number[]>;
  /** keys to draw (reference is the zero line and is never drawn as a series) */
  keys: string[];
  /** shared cursor position, metres along the reference */
  cursor: number;
  onSeek: (s: number) => void;
  height?: number;
}

// Slope buckets for the band fill. One closed path + fill() per grid station per
// series was 6,855 fill() submissions per cursor step with six laps selected;
// quantising the slope lets every station of one colour share a single path.
const SLOPE_BUCKETS = 9;
const SLOPE_FS = 0.1; // s per 100 m that saturates the ramp

/**
 * Cumulative time delta against the reference lap, along the track.
 *
 * This is the one chart that answers "where did the lap go". A trace sloping
 * upward is losing time *right there*; a flat trace is matching the reference
 * even if it is already a second behind. Reading the slope rather than the
 * height is the whole skill, so the band fill is keyed to slope sign.
 */
export function CompareDeltaChart({ cmp, colorOf, dashOf, keys, cursor, onSeek, height = 210 }: Props) {
  const ink = usePlateInk();
  // memoised so the deps array is stable: a fresh array identity on every parent
  // render (setSubjectKey, setChannel, setLoading…) re-ran the whole draw
  const series = useMemo(
    () => cmp.laps.filter((l) => keys.includes(l.key) && !l.isReference),
    [cmp, keys],
  );

  const ref = useCanvasDraw(({ ctx, w, h }) => {
    ctx.clearRect(0, 0, w, h);
    const f = distanceFrame(w, h, cmp.refLength);

    let maxAbs = 0.2;
    for (const l of series) for (const v of l.grid.dt) if (!Number.isNaN(v)) maxAbs = Math.max(maxAbs, Math.abs(v));
    maxAbs *= 1.12;
    const Y = (v: number) => f.y1 - ((v + maxAbs) / (2 * maxAbs)) * (f.y1 - f.y0);

    // Stretches of axis at least one drawn lap never rode. Hatched, not blank:
    // a blank margin reads as "nothing happened there", which is the exact
    // misreading the NaN mask in `grid.dt` exists to prevent.
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

    // y grid
    const step = niceStep(maxAbs, 2.5);
    ctx.font = plateFont(9);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = -Math.floor(maxAbs / step) * step; v <= maxAbs; v += step) {
      const y = Y(v);
      const zero = Math.abs(v) < 1e-9;
      ctx.strokeStyle = zero ? ink.ink : ink.ruleFaint;
      ctx.setLineDash(zero ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(f.x0, y);
      ctx.lineTo(f.x1, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = zero ? ink.ink2 : ink.ink3;
      ctx.fillText(zero ? 'REF' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}s`, f.x0 - 5, y);
    }

    drawTurnTicks(ctx, f, cmp.corners, ink);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = ink.ink3;
    ctx.fillText('LOSING', f.x0 + 3, f.y0 + 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('GAINING', f.x0 + 3, f.y1 - 2);

    // one pass per series: a slope-coloured band under the trace, then the line
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const l of series) {
      const dt = l.grid.dt;
      const n = Math.min(dt.length, cmp.s.length);
      // sort the stations into slope buckets, then emit one path per bucket
      const buckets: number[][] = [];
      for (let k = 1; k < n; k++) {
        if (Number.isNaN(dt[k]) || Number.isNaN(dt[k - 1])) continue;
        const slope = (dt[k] - dt[k - 1]) / Math.max(1e-6, (cmp.s[k] - cmp.s[k - 1]) / 100);
        const norm = Math.max(-1, Math.min(1, slope / SLOPE_FS));
        const b = Math.min(SLOPE_BUCKETS - 1, Math.round(((norm + 1) / 2) * (SLOPE_BUCKETS - 1)));
        (buckets[b] ??= []).push(k);
      }
      ctx.globalAlpha = 0.18;
      for (let b = 0; b < buckets.length; b++) {
        const ks = buckets[b];
        if (!ks) continue;
        ctx.fillStyle = deltaColor(ink, ((b / (SLOPE_BUCKETS - 1)) * 2 - 1) * SLOPE_FS, SLOPE_FS);
        ctx.beginPath();
        for (const k of ks) {
          ctx.moveTo(f.X(cmp.s[k - 1]), Y(0));
          ctx.lineTo(f.X(cmp.s[k - 1]), Y(dt[k - 1]));
          ctx.lineTo(f.X(cmp.s[k]), Y(dt[k]));
          ctx.lineTo(f.X(cmp.s[k]), Y(0));
          ctx.closePath();
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colorOf.get(l.key) ?? ink.ink;
      ctx.setLineDash(dashOf?.get(l.key) ?? []);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let open = false;
      for (let k = 0; k < n; k++) {
        if (Number.isNaN(dt[k])) { open = false; continue; }
        const x = f.X(cmp.s[k]);
        const y = Y(dt[k]);
        if (open) ctx.lineTo(x, y);
        else { ctx.moveTo(x, y); open = true; }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // where the lap left the reference layout, say so rather than leave a gap
      if (l.sectionFraction < 0.98) {
        for (const edge of [l.section.sIn, l.section.sOut]) {
          if (edge <= 0 || edge >= cmp.refLength) continue;
          ctx.save();
          ctx.strokeStyle = colorOf.get(l.key) ?? ink.ink;
          ctx.setLineDash([2, 3]);
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(f.X(edge), f.y0);
          ctx.lineTo(f.X(edge), f.y1);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    drawPlotFrame(ctx, f, ink);
    drawDistanceLabels(ctx, f, ink);
    drawCursor(ctx, f, cursor, ink);

    // read-out dots where the cursor crosses each trace
    for (const l of series) {
      const k = nearestIndex(cmp.s, cursor);
      if (Number.isNaN(l.grid.dt[k])) continue;
      ctx.fillStyle = colorOf.get(l.key) ?? ink.ink;
      ctx.beginPath();
      ctx.arc(f.X(cursor), Y(l.grid.dt[k]), 3.5, 0, 7);
      ctx.fill();
    }
  }, [cmp, series, colorOf, dashOf, cursor, height, ink]);

  return (
    <canvas
      ref={ref}
      onClick={(e) => ref.current && onSeek(seekFromClick(e, ref.current, cmp.refLength))}
      className="block w-full cursor-crosshair"
      style={{ height, background: 'var(--color-plane-2)' }}
    />
  );
}

export function nearestIndex(s: Float32Array, value: number): number {
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  if (lo + 1 < s.length && Math.abs(s[lo + 1] - value) < Math.abs(s[lo] - value)) return lo + 1;
  return lo;
}
