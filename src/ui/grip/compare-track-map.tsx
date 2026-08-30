import { useRef } from 'react';
import type { GripComparison } from '@/analysis/grip/compare';
import { hatchPattern, usePlateInk } from '@/ui/plate';
import { deltaColor } from './compare-colors';
import { fitTrackTransform, type TrackTransform } from './track-geometry';
import { plateFont, useCanvasDraw } from './use-canvas-draw';

interface Props {
  cmp: GripComparison;
  /** the lap whose time loss colours the track */
  subjectKey: string;
  colorOf: Map<string, string>;
  /** lap key → series dash, so the subject's own line is identifiable */
  dashOf?: Map<string, number[]>;
  /** metres along the reference */
  cursor: number;
  onSeek: (s: number) => void;
  /** draw the subject's own racing line over the reference */
  showLines?: boolean;
}

/** Seconds per 100 m that saturates the colour ramp. */
const RATE_FS = 0.1;

/**
 * The delta chart's spatial twin: the reference lap's line, coloured by how
 * fast the subject lap is losing (stop) or making (go) time at that point. Riders navigate by corners, not by metre counts, so this is usually
 * the panel that turns a number into a decision about next session.
 *
 * Where the subject was not on this stretch of track its delta is NaN, and the
 * line is hatched rather than coloured: neutral ink there would read as "level
 * here", which is a claim the mask exists to refuse.
 */
export function CompareTrackMap({ cmp, subjectKey, colorOf, dashOf, cursor, onSeek, showLines = true }: Props) {
  const fitRef = useRef<TrackTransform | null>(null);
  const ink = usePlateInk();
  const reference = cmp.laps.find((l) => l.isReference) ?? cmp.laps[0];
  const subject = cmp.laps.find((l) => l.key === subjectKey) ?? null;

  const canvasRef = useCanvasDraw(({ ctx, w, h }) => {
    ctx.clearRect(0, 0, w, h);
    const rx = reference.grid.x;
    const ry = reference.grid.y;
    const n = Math.min(rx.length, cmp.s.length);
    const fit = fitTrackTransform(rx, ry, 0, n - 1, w, h, 34);
    fitRef.current = fit;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // the tarmac ribbon
    ctx.strokeStyle = ink.terrainTint;
    ctx.lineWidth = 13;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const x = fit.X(rx[k]);
      const y = fit.Y(ry[k]);
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();

    // the reference line, coloured by the subject's local rate of time loss
    const unmeasured = hatchPattern(ctx, ink.rule);
    ctx.lineWidth = 8;
    for (let k = 1; k < n; k++) {
      let color: string | CanvasPattern = subject && !subject.isReference ? unmeasured : ink.ink3;
      const a = subject?.grid.dt[k - 1];
      const b = subject?.grid.dt[k];
      if (subject && !subject.isReference && a != null && b != null && !Number.isNaN(a) && !Number.isNaN(b)) {
        const ds = (cmp.s[k] - cmp.s[k - 1]) / 100;
        color = deltaColor(ink, ds > 1e-6 ? (b - a) / ds : 0, RATE_FS);
      }
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(fit.X(rx[k - 1]), fit.Y(ry[k - 1]));
      ctx.lineTo(fit.X(rx[k]), fit.Y(ry[k]));
      ctx.stroke();
    }

    // the subject's own line, thin, so a different line is visible as geometry
    if (showLines && subject && !subject.isReference) {
      ctx.strokeStyle = colorOf.get(subject.key) ?? ink.ink;
      ctx.setLineDash(dashOf?.get(subject.key) ?? []);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = fit.X(subject.grid.x[k]);
        const y = fit.Y(subject.grid.y[k]);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ruled turn badges, pushed outward from the track centre
    ctx.font = plateFont(11, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of cmp.corners) {
      const k = Math.min(n - 1, Math.max(0, Math.round((c.s / Math.max(1e-6, cmp.refLength)) * (n - 1))));
      const bx = fit.X(rx[k]);
      const by = fit.Y(ry[k]);
      let dx = bx - fit.cx;
      let dy = by - fit.cy;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
      const lx = Math.round(bx + dx * 18);
      const ly = Math.round(by + dy * 18);
      const stat = subject ? c.stats.find((s) => s.key === subject.key) : undefined;
      const gain =
        stat && subject && !subject.isReference && Number.isFinite(stat.deltaGain)
          ? stat.deltaGain
          : null;
      ctx.fillStyle = ink.sheet;
      ctx.fillRect(lx - 9, ly - 9, 18, 18);
      ctx.fillStyle = gain != null ? deltaColor(ink, gain, 0.25) : ink.ink3;
      ctx.fillRect(lx - 9, ly + 5, 18, 4);
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(lx - 9, ly - 9, 18, 18);
      ctx.fillStyle = ink.ink;
      ctx.fillText(String(c.turn), lx, ly - 1);
    }

    // start/finish: the timing line, drawn across the track
    if (n > 1) {
      const hx = fit.X(rx[1]) - fit.X(rx[0]);
      const hy = fit.Y(ry[1]) - fit.Y(ry[0]);
      const hl = Math.hypot(hx, hy) || 1;
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fit.X(rx[0]) - (hy / hl) * 9, fit.Y(ry[0]) + (hx / hl) * 9);
      ctx.lineTo(fit.X(rx[0]) + (hy / hl) * 9, fit.Y(ry[0]) - (hx / hl) * 9);
      ctx.stroke();
    }

    // cursor
    const ck = Math.min(n - 1, Math.max(0, Math.round((cursor / Math.max(1e-6, cmp.refLength)) * (n - 1))));
    ctx.fillStyle = ink.sheet;
    ctx.beginPath();
    ctx.arc(fit.X(rx[ck]), fit.Y(ry[ck]), 5, 0, 7);
    ctx.fill();
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(fit.X(rx[ck]), fit.Y(ry[ck]), 8, 0, 7);
    ctx.stroke();
  }, [cmp, reference, subject, colorOf, dashOf, cursor, showLines, ink]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const fit = fitRef.current;
    const cv = canvasRef.current;
    if (!fit || !cv) return;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const rx = reference.grid.x;
    const ry = reference.grid.y;
    const n = Math.min(rx.length, cmp.s.length);
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < n; k++) {
      const d = (fit.X(rx[k]) - mx) ** 2 + (fit.Y(ry[k]) - my) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    onSeek(cmp.s[best]);
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      className="block w-full cursor-crosshair"
      style={{ aspectRatio: '16 / 10', background: 'var(--color-plane-2)' }}
    />
  );
}
