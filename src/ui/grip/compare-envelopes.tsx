import { ENVELOPE_BINS, envelopeRadius } from '@/analysis/grip/envelope';
import { usePlateInk } from '@/ui/plate';
import { plateFont, useCanvasDraw } from './use-canvas-draw';

export interface EnvelopeSeries {
  key: string;
  label: string;
  env: Float32Array;
  color: string;
  /** the dash that goes with `color`: identity is never hue alone here */
  dash?: number[];
}

interface Props {
  series: EnvelopeSeries[];
  /** display reference ring, g */
  anchorG: number;
}

/** Observed directional summaries; disconnected arcs preserve missing support. */
export function CompareEnvelopes({ series, anchorG }: Props) {
  const ink = usePlateInk();
  const ref = useCanvasDraw(({ ctx, w, h }) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const pad = 26;
    const R = Math.min(w, h) / 2 - pad;
    let gmax = Math.max(1.3, anchorG + 0.15);
    for (const s of series) for (const v of s.env) if (Number.isFinite(v)) gmax = Math.max(gmax, v + 0.08);
    const P = (gx: number, gy: number): [number, number] => [cx + (gx / gmax) * R, cy - (gy / gmax) * R];

    ctx.strokeStyle = ink.ruleFaint;
    ctx.lineWidth = 1;
    ctx.font = plateFont(10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let g = gmax / 5; g <= gmax + 0.001; g += gmax / 5) {
      ctx.beginPath();
      ctx.arc(cx, cy, (g / gmax) * R, 0, 7);
      ctx.stroke();
    }
    ctx.strokeStyle = ink.rule;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.fillStyle = ink.ink3;
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

    // display-scale reference ring
    ctx.strokeStyle = ink.caution;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, (anchorG / gmax) * R, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ink.caution;
    ctx.fillText(`SCALE ${anchorG.toFixed(2)}G`, cx, cy - (anchorG / gmax) * R - 7);

    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.setLineDash(s.dash ?? []);
      ctx.lineWidth = 2;
      ctx.beginPath();
      let drawing = false;
      for (let b = 0; b <= ENVELOPE_BINS; b++) {
        const th = -Math.PI + ((b + 0.5) / ENVELOPE_BINS) * 2 * Math.PI;
        const r = envelopeRadius(s.env, th);
        if (!Number.isFinite(r)) { drawing = false; continue; }
        const [x, y] = P(r * Math.cos(th), r * Math.sin(th));
        drawing ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        drawing = true;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [series, anchorG, ink]);

  return (
    <canvas
      ref={ref}
      className="mx-auto block w-full max-w-[420px]"
      style={{ aspectRatio: '1 / 1', background: 'var(--color-plane-2)' }}
    />
  );
}
