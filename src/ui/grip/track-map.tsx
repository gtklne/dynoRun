import { useRef } from 'react';
import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { hatchPattern, usePlateInk } from '@/ui/plate';
import { scoreColor } from './colors';
import { fitTrackTransform } from './track-geometry';
import { plateFont, useCanvasDraw, useStaticLayer } from './use-canvas-draw';

interface TrackMapProps {
  analysis: GripAnalysis;
  lap: GripLap;
  /** local sample index within the lap */
  cursor: number;
  /** active metric per global sample in g (grip demand or dynamic load) */
  metric: ArrayLike<number>;
  /** live apex demand (g) per corner number, against the active metric */
  cornerApexG: Map<number, number>;
  /** tyre-class colour anchor, g */
  anchorG: number;
  onSeek: (localIndex: number) => void;
  /** the cross-referenced instant, as a local index, drawn as a leader mark */
  xref?: number | null;
  /** publishes the sample under the pointer to the plate's cross-reference */
  onHover?: (localIndex: number | null) => void;
}

interface Geo {
  X: (globalIdx: number) => number;
  Y: (globalIdx: number) => number;
}

/**
 * The plan view: the racing line coloured by the active metric, with a ruled
 * turn badge on every apex. Badges carry the track turn id, so the same box
 * means the same bend when the rider switches lap tabs.
 */
export function TrackMap({
  analysis,
  lap,
  cursor,
  metric,
  cornerApexG,
  anchorG,
  onSeek,
  xref = null,
  onHover,
}: TrackMapProps) {
  const geoRef = useRef<Geo | null>(null);
  const staticLayer = useStaticLayer();
  const ink = usePlateInk();

  const ref = useCanvasDraw((size) => {
    const { ctx, w, h } = size;
    const { px, py } = analysis;
    const { start, end } = lap;
    ctx.clearRect(0, 0, w, h);

    const fit = fitTrackTransform(px, py, start, end, w, h, 34);
    const X = (i: number) => fit.X(px[i]);
    const Y = (i: number) => fit.Y(py[i]);
    geoRef.current = { X, Y };

    // Everything except the cursor marker is fixed for a given lap and metric,
    // so it is painted once into an offscreen layer instead of ~1,900 stroked
    // paths per playback frame.
    const layer = staticLayer([analysis, lap, metric, cornerApexG, anchorG, ink], size, (c) => {
      // the tarmac ribbon under the racing line
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.strokeStyle = ink.terrainTint;
      c.lineWidth = 13;
      c.beginPath();
      for (let i = start; i <= end; i++) (i === start ? c.moveTo(X(i), Y(i)) : c.lineTo(X(i), Y(i)));
      c.stroke();

      // racing line coloured by the active metric
      c.lineWidth = 8;
      for (let i = start + 1; i <= end; i++) {
        c.strokeStyle = scoreColor(ink, (metric[i - 1] + metric[i]) / 2, anchorG);
        c.beginPath();
        c.moveTo(X(i - 1), Y(i - 1));
        c.lineTo(X(i), Y(i));
        c.stroke();
      }

      // ruled turn badges, offset outward from the track centroid. A box with a
      // demand-coloured footer, rather than a colour-filled disc: the number
      // has to stay readable at both ends of the ramp and on both plates.
      c.font = plateFont(11, 700);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const { cx, cy } = fit;
      for (const corner of lap.corners) {
        const bx = X(corner.ap);
        const by = Y(corner.ap);
        let dx = bx - cx;
        let dy = by - cy;
        const L = Math.hypot(dx, dy) || 1;
        dx /= L;
        dy /= L;
        const lx = Math.round(bx + dx * 17);
        const ly = Math.round(by + dy * 17);
        c.fillStyle = ink.sheet;
        c.fillRect(lx - 9, ly - 9, 18, 18);
        c.fillStyle = scoreColor(ink, cornerApexG.get(corner.n) ?? 0, anchorG);
        c.fillRect(lx - 9, ly + 5, 18, 4);
        if (corner.turn) {
          c.fillStyle = ink.ink;
          // the track's turn number, not the per-lap detection index
          c.fillText(String(corner.turn), lx, ly - 1);
        } else {
          // no other lap agrees this is a bend, so it has no turn number to
          // print: hatched, the plate's mark for "not identified"
          c.fillStyle = hatchPattern(c, ink.rule);
          c.fillRect(lx - 9, ly - 9, 18, 14);
        }
        c.strokeStyle = ink.ink;
        c.lineWidth = 1.5;
        c.strokeRect(lx - 9, ly - 9, 18, 18);
      }

      // start/finish: a bar across the line, the way a timing line is drawn
      if (end > start) {
        const hx = X(start + 1) - X(start);
        const hy = Y(start + 1) - Y(start);
        const hl = Math.hypot(hx, hy) || 1;
        c.strokeStyle = ink.ink;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(X(start) - (hy / hl) * 9, Y(start) + (hx / hl) * 9);
        c.lineTo(X(start) + (hy / hl) * 9, Y(start) - (hx / hl) * 9);
        c.stroke();
      }
    });
    if (layer) ctx.drawImage(layer, 0, 0, w, h);

    // the cross-referenced instant, when it is not simply the cursor
    if (xref != null && xref !== cursor) {
      const xi = Math.max(start, Math.min(end, start + xref));
      ctx.strokeStyle = ink.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(X(xi) - 5.5, Y(xi) - 5.5, 11, 11);
    }

    // current position
    const ci = Math.max(start, Math.min(end, start + cursor));
    ctx.fillStyle = ink.sheet;
    ctx.beginPath();
    ctx.arc(X(ci), Y(ci), 5, 0, 7);
    ctx.fill();
    ctx.strokeStyle = ink.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(X(ci), Y(ci), 8, 0, 7);
    ctx.stroke();
  }, [analysis, lap, cursor, metric, cornerApexG, anchorG, ink, xref]);

  function nearest(e: React.MouseEvent<HTMLCanvasElement>): number | null {
    const geo = geoRef.current;
    const cv = ref.current;
    if (!geo || !cv) return null;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = 0;
    let bd = Infinity;
    for (let i = lap.start; i <= lap.end; i++) {
      const d = (geo.X(i) - mx) ** 2 + (geo.Y(i) - my) ** 2;
      if (d < bd) { bd = d; best = i - lap.start; }
    }
    return best;
  }

  return (
    <canvas
      ref={ref}
      onClick={(e) => { const i = nearest(e); if (i != null) onSeek(i); }}
      onMouseMove={onHover ? (e) => onHover(nearest(e)) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      className="block w-full cursor-crosshair"
      style={{ aspectRatio: '16 / 10', background: 'var(--color-plane-2)' }}
    />
  );
}
