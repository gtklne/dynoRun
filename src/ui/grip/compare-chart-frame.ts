import type { ComparedCorner } from '@/analysis/grip/compare';
import { CANVAS_FONT } from './use-canvas-draw';

/**
 * Shared plotting frame for the distance-axis compare charts, so the delta
 * chart and the trace chart put the same metre at the same pixel and a single
 * cursor lines up across both.
 */

export const PAD = { l: 46, r: 12, t: 16, b: 18 } as const;

export interface DistanceFrame {
  /** metres along the reference → canvas x */
  X: (s: number) => number;
  /** canvas x → metres along the reference */
  inv: (x: number) => number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  length: number;
}

export function distanceFrame(w: number, h: number, length: number, pad = PAD): DistanceFrame {
  const x0 = pad.l;
  const x1 = w - pad.r;
  const span = Math.max(1e-6, length);
  return {
    X: (s: number) => x0 + (s / span) * (x1 - x0),
    inv: (x: number) => ((x - x0) / Math.max(1e-6, x1 - x0)) * span,
    x0,
    x1,
    y0: pad.t,
    y1: h - pad.b,
    length,
  };
}

/** A round-numbered grid step giving roughly `target` divisions over `range`. */
export function niceStep(range: number, target: number): number {
  if (!(range > 0)) return 1;
  const raw = range / Math.max(1, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return step * mag;
}

/** Faint verticals at each turn apex with its number along the top. */
export function drawTurnTicks(
  ctx: CanvasRenderingContext2D,
  f: DistanceFrame,
  corners: ComparedCorner[],
  label = true,
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.font = `9px ${CANVAS_FONT}`;
  ctx.fillStyle = '#6b6b74';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const c of corners) {
    const x = f.X(c.s);
    ctx.beginPath();
    ctx.moveTo(x, f.y0);
    ctx.lineTo(x, f.y1);
    ctx.stroke();
    if (label) ctx.fillText(`T${c.turn}`, x, 2);
  }
  ctx.restore();
}

/** The shared distance cursor. */
export function drawCursor(ctx: CanvasRenderingContext2D, f: DistanceFrame, s: number): void {
  const x = f.X(s);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, f.y0);
  ctx.lineTo(x, f.y1);
  ctx.stroke();
  ctx.restore();
}

/** Distance labels along the bottom, in metres or km. */
export function drawDistanceLabels(ctx: CanvasRenderingContext2D, f: DistanceFrame): void {
  const step = niceStep(f.length, 6);
  ctx.save();
  ctx.font = `9px ${CANVAS_FONT}`;
  ctx.fillStyle = '#6b6b74';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let s = 0; s <= f.length + 1; s += step) {
    ctx.fillText(s >= 1000 ? `${(s / 1000).toFixed(1)}km` : `${Math.round(s)}m`, f.X(s), f.y1 + 3);
  }
  ctx.restore();
}

/** Map a click on a distance-axis canvas back to metres. */
export function seekFromClick(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
  length: number,
): number {
  const r = canvas.getBoundingClientRect();
  const f = distanceFrame(r.width, r.height, length);
  return Math.max(0, Math.min(length, f.inv(e.clientX - r.left)));
}
