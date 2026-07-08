import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { envelopeRadius, ENVELOPE_BINS } from '@/analysis/grip/envelope';
import { rateColor, utilColor } from './colors';
import { CANVAS_FONT, useCanvasDraw } from './use-canvas-draw';

const GMAX = 1.3; // full-scale g at the outer radius
const TRAIL = 45; // comet trail length in samples (~1.8 s)

interface TractionCircleProps {
  analysis: GripAnalysis;
  lap: GripLap;
  cursor: number;
  metric: ArrayLike<number>;
  rateFS: number;
}

/**
 * Lateral × longitudinal g. Dashed line = fitted grip envelope; dots = every
 * sample this lap. The comet trail's brightness and width encode the
 * load-transfer rate, so a fast throttle↔brake move streaks through the
 * centre; the arrow shows where the load is heading next.
 */
export function TractionCircle({ analysis, lap, cursor, metric, rateFS }: TractionCircleProps) {
  const ref = useCanvasDraw(({ ctx, w, h }) => {
    const d = analysis;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, pad = 26;
    const R = Math.min(w, h) / 2 - pad;
    const P = (gx: number, gy: number): [number, number] => [cx + (gx / GMAX) * R, cy - (gy / GMAX) * R];

    // grid rings + axes
    ctx.strokeStyle = '#2c2c2a';
    ctx.lineWidth = 1;
    ctx.font = `10px ${CANVAS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let g = 0.25; g <= GMAX + 0.001; g += 0.25) {
      ctx.beginPath(); ctx.arc(cx, cy, (g / GMAX) * R, 0, 7); ctx.stroke();
    }
    ctx.strokeStyle = '#3a3a37';
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.fillStyle = '#898781';
    ctx.fillText('BRAKE', cx, cy + R + 12);
    ctx.fillText('ACCEL', cx, cy - R - 12);
    ctx.save(); ctx.translate(cx - R - 13, cy); ctx.rotate(-Math.PI / 2); ctx.fillText('LEFT', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(cx + R + 13, cy); ctx.rotate(Math.PI / 2); ctx.fillText('RIGHT', 0, 0); ctx.restore();
    ctx.fillStyle = '#66655f';
    ctx.fillText('1.0g', P(0, 1.0)[0] + 13, P(0, 1.0)[1]);

    // fitted envelope
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let b = 0; b <= ENVELOPE_BINS; b++) {
      const th = -Math.PI + (b / ENVELOPE_BINS) * 2 * Math.PI;
      const r = envelopeRadius(d.env, th);
      const [x, y] = P(r * Math.cos(th), r * Math.sin(th));
      b ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // faint scatter: where you operate this lap
    ctx.globalAlpha = 0.28;
    for (let i = lap.start; i <= lap.end; i++) {
      const [x, y] = P(d.alat[i], d.along[i]);
      ctx.fillStyle = utilColor(metric[i]);
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // comet trail — recent path, brightness+width = load-transfer rate
    const cur = lap.start + cursor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = Math.max(lap.start + 1, cur - TRAIL); i <= cur; i++) {
      const age = (cur - i) / TRAIL;
      const n = Math.min(1, d.loadRate[i] / rateFS);
      const [x0, y0] = P(d.alat[i - 1], d.along[i - 1]);
      const [x1, y1] = P(d.alat[i], d.along[i]);
      ctx.globalAlpha = (1 - age) * (0.25 + 0.75 * n);
      ctx.strokeStyle = rateColor(n);
      ctx.lineWidth = 1 + n * 4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // current point + radius vector
    const [px, py] = P(d.alat[cur], d.along[cur]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();

    // dG/dt arrow — direction & speed the load state is moving right now
    const n = Math.min(1, d.loadRate[cur] / rateFS);
    if (d.loadRate[cur] > 0.08) {
      const ang = Math.atan2(-d.jLong[cur], d.jLat[cur]); // screen: y down
      const len = 10 + n * 34;
      const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
      ctx.strokeStyle = rateColor(n);
      ctx.fillStyle = rateColor(n);
      ctx.lineWidth = 1.5 + n * 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
      const ah = 4 + n * 3;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.4) * ah, ey - Math.sin(ang - 0.4) * ah);
      ctx.lineTo(ex - Math.cos(ang + 0.4) * ah, ey - Math.sin(ang + 0.4) * ah);
      ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = utilColor(metric[cur]);
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.stroke();
  }, [analysis, lap, cursor, metric, rateFS]);

  return (
    <canvas
      ref={ref}
      className="mx-auto block w-full max-w-[420px] rounded-lg bg-zinc-950"
      style={{ aspectRatio: '1 / 1' }}
    />
  );
}
