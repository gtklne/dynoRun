import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { usePlateInk } from '@/ui/plate';
import { inkAlpha, rateColor } from './colors';
import { plateFont, useCanvasDraw } from './use-canvas-draw';

const PAD_L = 8, PAD_R = 8;
const A_FS = 1.0; // longitudinal-g full scale

interface LoadTimelineProps {
  analysis: GripAnalysis;
  lap: GripLap;
  cursor: number;
  rateFS: number;
  onSeek: (localIndex: number) => void;
  /** the cross-referenced instant, as a local index */
  xref?: number | null;
  /** publishes the sample under the pointer to the plate's cross-reference */
  onHover?: (localIndex: number | null) => void;
}

/**
 * The profile view: two bands on the lap's own time axis. Top, longitudinal g
 * (accel up, brake down). Bottom, load-transfer rate. The payoff is seeing the
 * top trace cross zero exactly where the bottom spikes: the chassis loaded
 * "through the origin". Hairlines mark corner apexes.
 */
export function LoadTimeline({ analysis, lap, cursor, rateFS, onSeek, xref = null, onHover }: LoadTimelineProps) {
  const ink = usePlateInk();

  const ref = useCanvasDraw(({ ctx, w, h }) => {
    const d = analysis;
    ctx.clearRect(0, 0, w, h);
    const n = lap.end - lap.start + 1;
    // a one-sample lap would divide by zero and put NaN into every moveTo
    const span = Math.max(1, n - 1);
    const X = (k: number) => PAD_L + (k / span) * (w - PAD_L - PAD_R);
    const topH = h * 0.5, gap = 8, botTop = topH + gap, botH = h - botTop - 4;
    const zeroY = topH * 0.5;
    ctx.font = plateFont(9);

    // apex hairlines across both bands
    ctx.strokeStyle = ink.ruleFaint;
    ctx.lineWidth = 1;
    for (const c of lap.corners) {
      const x = X(c.ap - lap.start);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // Top band: longitudinal g. Two flat tints split at the zero rule rather
    // than one vertical gradient: drive and brake are two states, not a
    // continuum, and the plate has no gradients.
    //
    // Ink weights, not the traffic light. Green and red are spent two panels up
    // on grip demand, where green means grip in hand and red means at the limit,
    // so a green accel band here would claim the opposite of what it looks like.
    // Brake takes the heavier ink because it is the heavier work.
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(X(0), zeroY);
      for (let k = 0; k < n; k++) {
        const v = Math.max(-A_FS, Math.min(A_FS, d.along[lap.start + k]));
        ctx.lineTo(X(k), zeroY - (v / A_FS) * (topH * 0.5 - 3));
      }
      ctx.lineTo(X(n - 1), zeroY);
      ctx.closePath();
    };
    for (const half of [
      { y: 0, height: zeroY, color: ink.ink3 },
      { y: zeroY, height: topH - zeroY, color: ink.ink },
    ]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, half.y, w, half.height);
      ctx.clip();
      trace();
      ctx.fillStyle = inkAlpha(half.color, 0.2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const v = Math.max(-A_FS, Math.min(A_FS, d.along[lap.start + k]));
      const y = zeroY - (v / A_FS) * (topH * 0.5 - 3);
      k ? ctx.lineTo(X(k), y) : ctx.moveTo(X(k), y);
    }
    ctx.stroke();

    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, zeroY); ctx.lineTo(w - PAD_R, zeroY); ctx.stroke();
    ctx.fillStyle = ink.ink3;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ACCEL', PAD_L + 2, 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('BRAKE', PAD_L + 2, topH - 2);

    // bottom band: transfer rate
    const baseY = botTop + botH;
    ctx.beginPath();
    ctx.moveTo(X(0), baseY);
    for (let k = 0; k < n; k++) {
      const rr = Math.min(1, d.loadRate[lap.start + k] / rateFS);
      ctx.lineTo(X(k), baseY - rr * (botH - 2));
    }
    ctx.lineTo(X(n - 1), baseY);
    ctx.closePath();
    ctx.fillStyle = inkAlpha(ink.ink3, 0.32);
    ctx.fill();
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const rr = Math.min(1, d.loadRate[lap.start + k] / rateFS);
      k ? ctx.lineTo(X(k), baseY - rr * (botH - 2)) : ctx.moveTo(X(k), baseY - rr * (botH - 2));
    }
    ctx.stroke();
    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, baseY); ctx.lineTo(w - PAD_R, baseY); ctx.stroke();
    // the full-scale line, so a saturated spike is legible as saturated
    ctx.strokeStyle = ink.caution;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(PAD_L, baseY - (botH - 2)); ctx.lineTo(w - PAD_R, baseY - (botH - 2)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ink.ink3;
    ctx.textBaseline = 'top';
    ctx.fillText(`TRANSFER RATE, FULL SCALE ${rateFS.toFixed(1)} G/S`, PAD_L + 2, botTop + 1);

    // the cross-referenced instant, when it is not simply the cursor
    if (xref != null && xref !== cursor) {
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(xref), 0); ctx.lineTo(X(xref), h); ctx.stroke();
      ctx.setLineDash([]);
    }

    // cursor
    const cx = X(cursor);
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    const rr = Math.min(1, d.loadRate[lap.start + cursor] / rateFS);
    ctx.fillStyle = rateColor(ink, rr);
    ctx.beginPath(); ctx.arc(cx, baseY - rr * (botH - 2), 3.5, 0, 7); ctx.fill();
  }, [analysis, lap, cursor, rateFS, ink, xref]);

  function localAt(clientX: number): number | null {
    const cv = ref.current;
    if (!cv) return null;
    const r = cv.getBoundingClientRect();
    const f = (clientX - r.left - PAD_L) / (r.width - PAD_L - PAD_R);
    return Math.round(Math.max(0, Math.min(1, f)) * (lap.end - lap.start));
  }

  return (
    <canvas
      ref={ref}
      onClick={(e) => { const i = localAt(e.clientX); if (i != null) onSeek(i); }}
      onMouseMove={onHover ? (e) => onHover(localAt(e.clientX)) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      className="block h-[150px] w-full cursor-crosshair"
      style={{ background: 'var(--color-plane-2)' }}
    />
  );
}
