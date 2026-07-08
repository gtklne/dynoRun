import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { rateColor } from './colors';
import { CANVAS_FONT, useCanvasDraw } from './use-canvas-draw';

const PAD_L = 8, PAD_R = 8;
const A_FS = 1.0; // longitudinal-g full scale

interface LoadTimelineProps {
  analysis: GripAnalysis;
  lap: GripLap;
  cursor: number;
  rateFS: number;
  onSeek: (localIndex: number) => void;
}

/**
 * Two bands on a shared time axis. Top: longitudinal g (accel up, brake
 * down). Bottom: load-transfer rate. The payoff is seeing the top trace cross
 * zero exactly where the bottom spikes — the chassis loaded "through the
 * origin". Faint vertical lines mark corner apexes.
 */
export function LoadTimeline({ analysis, lap, cursor, rateFS, onSeek }: LoadTimelineProps) {
  const ref = useCanvasDraw(({ ctx, w, h }) => {
    const d = analysis;
    ctx.clearRect(0, 0, w, h);
    const n = lap.end - lap.start + 1;
    const X = (k: number) => PAD_L + (k / (n - 1)) * (w - PAD_L - PAD_R);
    const topH = h * 0.5, gap = 8, botTop = topH + gap, botH = h - botTop - 4;
    const zeroY = topH * 0.5;
    ctx.font = `10px ${CANVAS_FONT}`;

    // apex ticks across both bands
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (const c of lap.corners) {
      const x = X(c.ap - lap.start);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    // top band: longitudinal g
    const g1 = ctx.createLinearGradient(0, 0, 0, topH);
    g1.addColorStop(0, 'rgba(25,158,112,0.85)');
    g1.addColorStop(0.5, 'rgba(120,120,110,0.15)');
    g1.addColorStop(1, 'rgba(208,59,59,0.85)');
    ctx.beginPath();
    ctx.moveTo(X(0), zeroY);
    for (let k = 0; k < n; k++) {
      const v = Math.max(-A_FS, Math.min(A_FS, d.along[lap.start + k]));
      ctx.lineTo(X(k), zeroY - (v / A_FS) * (topH * 0.5 - 3));
    }
    ctx.lineTo(X(n - 1), zeroY);
    ctx.closePath();
    ctx.fillStyle = g1;
    ctx.fill();
    ctx.strokeStyle = '#2c2c2a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, zeroY); ctx.lineTo(w - PAD_R, zeroY); ctx.stroke();
    ctx.fillStyle = '#66655f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ACCEL', PAD_L + 2, 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText('BRAKE', PAD_L + 2, topH - 2);

    // bottom band: transfer rate
    const baseY = botTop + botH;
    const g2 = ctx.createLinearGradient(0, baseY, 0, botTop);
    g2.addColorStop(0, 'rgba(61,74,99,0.55)');
    g2.addColorStop(0.6, 'rgba(79,176,255,0.85)');
    g2.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.beginPath();
    ctx.moveTo(X(0), baseY);
    for (let k = 0; k < n; k++) {
      const rr = Math.min(1, d.loadRate[lap.start + k] / rateFS);
      ctx.lineTo(X(k), baseY - rr * (botH - 2));
    }
    ctx.lineTo(X(n - 1), baseY);
    ctx.closePath();
    ctx.fillStyle = g2;
    ctx.fill();
    ctx.strokeStyle = '#2c2c2a';
    ctx.beginPath(); ctx.moveTo(PAD_L, baseY); ctx.lineTo(w - PAD_R, baseY); ctx.stroke();
    ctx.fillStyle = '#66655f';
    ctx.textBaseline = 'top';
    ctx.fillText('TRANSFER RATE (g/s)', PAD_L + 2, botTop + 1);

    // cursor
    const cx = X(cursor);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    const rr = Math.min(1, d.loadRate[lap.start + cursor] / rateFS);
    ctx.fillStyle = rateColor(rr);
    ctx.beginPath(); ctx.arc(cx, baseY - rr * (botH - 2), 3.5, 0, 7); ctx.fill();
  }, [analysis, lap, cursor, rateFS]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = ref.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const f = (e.clientX - r.left - PAD_L) / (r.width - PAD_L - PAD_R);
    onSeek(Math.round(Math.max(0, Math.min(1, f)) * (lap.end - lap.start)));
  }

  return (
    <canvas
      ref={ref}
      onClick={onClick}
      className="block h-[150px] w-full cursor-crosshair rounded-lg bg-zinc-950"
    />
  );
}
