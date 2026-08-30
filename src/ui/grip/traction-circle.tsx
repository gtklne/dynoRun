import { useRef } from 'react';
import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { envelopeRadius, ENVELOPE_BINS } from '@/analysis/grip/envelope';
import { usePlateInk, type PlateInk } from '@/ui/plate';
import { rateColor, scoreColor } from './colors';
import { plateFont, useCanvasDraw, useStaticLayer } from './use-canvas-draw';

const TRAIL = 45; // comet trail length in samples (~1.8 s)

interface TractionCircleProps {
  analysis: GripAnalysis;
  lap: GripLap;
  cursor: number;
  metric: ArrayLike<number>;
  rateFS: number;
  /** tyre-class colour anchor, g, also drawn as the reference ring */
  anchorG: number;
  /** the cross-referenced instant, as a local index */
  xref?: number | null;
  /** publishes the sample nearest the pointer in g-g space */
  onHover?: (localIndex: number | null) => void;
}

/**
 * Lateral × longitudinal g. Dashed line = fitted grip envelope; dots = every
 * sample this lap. The comet trail's weight encodes the load-transfer rate, so
 * a fast throttle↔brake move streaks through the centre; the arrow shows where
 * the load is heading next.
 */
export function TractionCircle({
  analysis,
  lap,
  cursor,
  metric,
  rateFS,
  anchorG,
  xref = null,
  onHover,
}: TractionCircleProps) {
  const staticLayer = useStaticLayer();
  const ink = usePlateInk();
  const planeRef = useRef<{ P: (gx: number, gy: number) => [number, number] } | null>(null);

  const ref = useCanvasDraw((size) => {
    const { ctx, w, h } = size;
    const d = analysis;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, pad = 26;
    const R = Math.min(w, h) / 2 - pad;
    const GMAX = Math.max(1.3, anchorG + 0.15); // full-scale g at the outer radius
    const P = (gx: number, gy: number): [number, number] => [cx + (gx / GMAX) * R, cy - (gy / GMAX) * R];
    planeRef.current = { P };

    // The rings, the envelope and the whole-lap scatter are fixed for a given lap
    // and metric: one filled arc per lap sample, ~1,900 of them, was being
    // repainted on every playback frame for a cursor dot that moved a few pixels.
    const layer = staticLayer([analysis, lap, metric, anchorG, ink], size, (bg) => {
      paintBackdrop(bg, { cx, cy, R, GMAX, P, d, lap, metric, anchorG, ink });
    });
    if (layer) {
      ctx.drawImage(layer, 0, 0, w, h);
    } else {
      paintBackdrop(ctx, { cx, cy, R, GMAX, P, d, lap, metric, anchorG, ink });
    }

    // comet trail: recent path, weight = load-transfer rate
    const cur = Math.max(lap.start, Math.min(lap.end, lap.start + cursor));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = Math.max(lap.start + 1, cur - TRAIL); i <= cur; i++) {
      const age = (cur - i) / TRAIL;
      const n = Math.min(1, d.loadRate[i] / rateFS);
      const [x0, y0] = P(d.alat[i - 1], d.along[i - 1]);
      const [x1, y1] = P(d.alat[i], d.along[i]);
      ctx.globalAlpha = (1 - age) * (0.25 + 0.75 * n);
      ctx.strokeStyle = rateColor(ink, n);
      ctx.lineWidth = 1 + n * 4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the cross-referenced instant, when it is not simply the cursor
    if (xref != null && xref !== cursor) {
      const xi = Math.max(lap.start, Math.min(lap.end, lap.start + xref));
      const [hx, hy] = P(d.alat[xi], d.along[xi]);
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(hx - 5.5, hy - 5.5, 11, 11);
    }

    // current point + radius vector
    const [px, py] = P(d.alat[cur], d.along[cur]);
    ctx.strokeStyle = ink.rule;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();

    // dG/dt arrow: direction & speed the load state is moving right now
    const n = Math.min(1, d.loadRate[cur] / rateFS);
    if (d.loadRate[cur] > 0.08) {
      const ang = Math.atan2(-d.jLong[cur], d.jLat[cur]); // screen: y down
      const len = 10 + n * 34;
      const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
      ctx.strokeStyle = rateColor(ink, n);
      ctx.fillStyle = rateColor(ink, n);
      ctx.lineWidth = 1.5 + n * 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
      const ah = 4 + n * 3;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.4) * ah, ey - Math.sin(ang - 0.4) * ah);
      ctx.lineTo(ex - Math.cos(ang + 0.4) * ah, ey - Math.sin(ang + 0.4) * ah);
      ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = ink.sheet;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = ink.procedure;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.stroke();
  }, [analysis, lap, cursor, metric, rateFS, anchorG, ink, xref]);

  /**
   * The circle has no axis to seek along, so a hover reports the lap sample
   * whose operating point is nearest the pointer. That is what makes the
   * scatter cross-referenceable: a dot out at the edge can be traced back to
   * the place on track and the instant in the lap that produced it.
   */
  function nearest(e: React.MouseEvent<HTMLCanvasElement>): number | null {
    const plane = planeRef.current;
    const cv = ref.current;
    if (!plane || !cv) return null;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = 0;
    let bd = Infinity;
    for (let i = lap.start; i <= lap.end; i++) {
      const [x, y] = plane.P(analysis.alat[i], analysis.along[i]);
      const dd = (x - mx) ** 2 + (y - my) ** 2;
      if (dd < bd) { bd = dd; best = i - lap.start; }
    }
    return best;
  }

  return (
    <canvas
      ref={ref}
      onMouseMove={onHover ? (e) => onHover(nearest(e)) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      className="mx-auto block w-full max-w-[420px]"
      style={{ aspectRatio: '1 / 1', background: 'var(--color-sunk)' }}
    />
  );
}

interface Backdrop {
  cx: number;
  cy: number;
  R: number;
  GMAX: number;
  P: (gx: number, gy: number) => [number, number];
  d: GripAnalysis;
  lap: GripLap;
  metric: ArrayLike<number>;
  anchorG: number;
  ink: PlateInk;
}

/** Grid, labels, tyre ring, fitted envelope and the lap's whole g-g scatter. */
function paintBackdrop(ctx: CanvasRenderingContext2D, s: Backdrop): void {
  const { cx, cy, R, GMAX, P, d, lap, metric, anchorG, ink } = s;

  // grid rings + axes
  ctx.strokeStyle = ink.ruleFaint;
  ctx.lineWidth = 1;
  ctx.font = plateFont(10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let g = 0.25; g <= GMAX + 0.001; g += 0.25) {
    ctx.beginPath(); ctx.arc(cx, cy, (g / GMAX) * R, 0, 7); ctx.stroke();
  }
  ctx.strokeStyle = ink.rule;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
  ctx.stroke();
  ctx.fillStyle = ink.ink3;
  ctx.fillText('BRAKE', cx, cy + R + 12);
  ctx.fillText('ACCEL', cx, cy - R - 12);
  ctx.save(); ctx.translate(cx - R - 13, cy); ctx.rotate(-Math.PI / 2); ctx.fillText('LEFT', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(cx + R + 13, cy); ctx.rotate(Math.PI / 2); ctx.fillText('RIGHT', 0, 0); ctx.restore();
  ctx.fillText('1.0g', P(0, 1.0)[0] + 13, P(0, 1.0)[1]);

  // tyre-class reference ring: an advisory, not a measurement, so it is the one
  // thing on this plane drawn in caution
  ctx.strokeStyle = ink.caution;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, (anchorG / GMAX) * R, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ink.caution;
  ctx.fillText(`TYRE ${anchorG.toFixed(2)}G`, cx, cy - (anchorG / GMAX) * R - 7);

  // fitted envelope
  ctx.strokeStyle = ink.ink;
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
  ctx.globalAlpha = 0.3;
  for (let i = lap.start; i <= lap.end; i++) {
    const [x, y] = P(d.alat[i], d.along[i]);
    ctx.fillStyle = scoreColor(ink, metric[i], anchorG);
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
