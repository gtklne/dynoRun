import { gapLimit, nearestTime } from '@/analysis/grip/time-series';
import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { usePlateInk } from '@/ui/plate';
import { plateFont, useCanvasDraw } from './use-canvas-draw';

const PAD_L = 8, PAD_R = 8;
interface LoadTimelineProps {
  analysis: GripAnalysis; lap: GripLap; cursor: number; rateFS: number;
  onSeek: (localIndex: number) => void;
  xref?: number | null;
  onHover?: (localIndex: number | null) => void;
}

/** Recorded time axis, with finite, contiguous traces and explicit scales. */
export function LoadTimeline({ analysis: d, lap, cursor, rateFS, onSeek, xref = null, onHover }: LoadTimelineProps) {
  const ink = usePlateInk();
  const ref = useCanvasDraw(({ ctx, w, h }) => {
    ctx.clearRect(0, 0, w, h);
    const t = d.ch.t;
    const span = t[lap.end] - t[lap.start] || 1;
    const X = (i: number) => PAD_L + (t[i] - t[lap.start]) / span * (w - PAD_L - PAD_R);
    const gap = gapLimit(t);
    let aFS = 1, rFS = rateFS;
    for (let i = lap.start; i <= lap.end; i++) {
      if (Number.isFinite(d.along[i])) aFS = Math.max(aFS, Math.abs(d.along[i]) * 1.05);
      if (Number.isFinite(d.loadRate[i])) rFS = Math.max(rFS, d.loadRate[i] * 1.05);
    }
    const zero = h * 0.25, base = h - 4, amp = h * 0.23;
    const trace = (values: Float32Array, y: (v: number) => number) => {
      let drawing = false;
      ctx.beginPath();
      for (let i = lap.start; i <= lap.end; i++) {
        if (!Number.isFinite(values[i])) { drawing = false; continue; }
        if (i > lap.start && t[i] - t[i - 1] > gap) drawing = false;
        drawing ? ctx.lineTo(X(i), y(values[i])) : ctx.moveTo(X(i), y(values[i]));
        drawing = true;
      }
      ctx.stroke();
    };
    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = 1;
    for (const y of [zero, base]) { ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(w - PAD_R, y); ctx.stroke(); }
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.2;
    trace(d.along, (v) => zero - v / aFS * amp);
    trace(d.loadRate, (v) => base - v / rFS * amp * 1.7);
    ctx.font = plateFont(9);
    ctx.fillStyle = ink.ink3;
    ctx.textAlign = 'left';
    ctx.fillText(`LONGITUDINAL DEMAND, ±${aFS.toFixed(1)} G`, PAD_L + 2, 10);
    ctx.fillText(`DEMAND RATE, 0-${rFS.toFixed(1)} G/S`, PAD_L + 2, h * 0.55);
    const hairline = (i: number) => { ctx.beginPath(); ctx.moveTo(X(i), 0); ctx.lineTo(X(i), h); ctx.stroke(); };
    ctx.strokeStyle = ink.ruleFaint;
    for (const c of lap.corners) hairline(c.ap);
    ctx.strokeStyle = ink.ink;
    if (xref != null && xref !== cursor) { ctx.setLineDash([3, 3]); hairline(lap.start + xref); ctx.setLineDash([]); }
    hairline(lap.start + cursor);
  }, [d, lap, cursor, rateFS, ink, xref]);

  function localAt(clientX: number): number | null {
    const cv = ref.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left - PAD_L) / (r.width - PAD_L - PAD_R)));
    return nearestTime(d.ch.t, d.ch.t[lap.start] + f * (d.ch.t[lap.end] - d.ch.t[lap.start]), lap.start, lap.end) - lap.start;
  }
  return <canvas ref={ref}
    onClick={(e) => { const i = localAt(e.clientX); if (i != null) onSeek(i); }}
    onMouseMove={onHover ? (e) => onHover(localAt(e.clientX)) : undefined}
    onMouseLeave={onHover ? () => onHover(null) : undefined}
    className="block h-[150px] w-full cursor-crosshair" style={{ background: 'var(--color-plane-2)' }} />;
}
