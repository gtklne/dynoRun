import { ENVELOPE_BINS, envelopeRadius } from '@/analysis/grip/envelope';
import { CANVAS_FONT, useCanvasDraw } from './use-canvas-draw';

export interface EnvelopeSeries {
  key: string;
  label: string;
  env: Float32Array;
  color: string;
}

interface Props {
  series: EnvelopeSeries[];
  /** tyre-class reference ring, g */
  anchorG: number;
}

/**
 * Two or more fitted traction envelopes on one g-g plane. The shapes are the
 * point: a boundary that is round-but-small says a rider used every direction
 * yet none of them hard, while one flattened at the top says the drive side is
 * where the session was left behind. A single score cannot separate those.
 *
 * Every envelope drawn here must have been fitted on the same number of timed
 * laps (see equalBudgetEnvelope) — the fit is max-preserving, so more laps can
 * only grow the boundary.
 */
export function CompareEnvelopes({ series, anchorG }: Props) {
  const ref = useCanvasDraw(({ ctx, w, h }) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const pad = 26;
    const R = Math.min(w, h) / 2 - pad;
    let gmax = Math.max(1.3, anchorG + 0.15);
    for (const s of series) for (const v of s.env) gmax = Math.max(gmax, v + 0.08);
    const P = (gx: number, gy: number): [number, number] => [cx + (gx / gmax) * R, cy - (gy / gmax) * R];

    ctx.strokeStyle = '#2c2c2a';
    ctx.lineWidth = 1;
    ctx.font = `10px ${CANVAS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let g = 0.25; g <= gmax + 0.001; g += 0.25) {
      ctx.beginPath();
      ctx.arc(cx, cy, (g / gmax) * R, 0, 7);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3a3a37';
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.fillStyle = '#898781';
    ctx.fillText('BRAKE', cx, cy + R + 12);
    ctx.fillText('DRIVE', cx, cy - R - 12);
    ctx.save();
    ctx.translate(cx - R - 13, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('LEFT', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(cx + R + 13, cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('RIGHT', 0, 0);
    ctx.restore();

    // tyre-class reference ring
    ctx.strokeStyle = 'rgba(208,59,59,0.4)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, (anchorG / gmax) * R, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(208,59,59,0.65)';
    ctx.fillText(`tyre ${anchorG.toFixed(2)}g`, cx, cy - (anchorG / gmax) * R - 7);

    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let b = 0; b <= ENVELOPE_BINS; b++) {
        const th = -Math.PI + (b / ENVELOPE_BINS) * 2 * Math.PI;
        const r = envelopeRadius(s.env, th);
        const [x, y] = P(r * Math.cos(th), r * Math.sin(th));
        b ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }, [series, anchorG]);

  return (
    <canvas
      ref={ref}
      className="mx-auto block w-full max-w-[420px] rounded-lg bg-zinc-950"
      style={{ aspectRatio: '1 / 1' }}
    />
  );
}
