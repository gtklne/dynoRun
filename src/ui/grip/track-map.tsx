import { useRef } from 'react';
import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { scoreColor } from './colors';
import { fitTrackTransform } from './track-geometry';
import { CANVAS_FONT, useCanvasDraw, useStaticLayer } from './use-canvas-draw';

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
}

interface Geo {
  X: (globalIdx: number) => number;
  Y: (globalIdx: number) => number;
}

/** Racing line coloured by the active metric; corner badges sit on apexes. */
export function TrackMap({ analysis, lap, cursor, metric, cornerApexG, anchorG, onSeek }: TrackMapProps) {
  const geoRef = useRef<Geo | null>(null);
  const staticLayer = useStaticLayer();

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
    const layer = staticLayer([analysis, lap, metric, cornerApexG, anchorG], size, (c) => {
      // track base (dark casing)
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.strokeStyle = '#000';
      c.lineWidth = 13;
      c.beginPath();
      for (let i = start; i <= end; i++) (i === start ? c.moveTo(X(i), Y(i)) : c.lineTo(X(i), Y(i)));
      c.stroke();

      // racing line coloured by the active metric
      c.lineWidth = 8;
      for (let i = start + 1; i <= end; i++) {
        c.strokeStyle = scoreColor((metric[i - 1] + metric[i]) / 2, anchorG);
        c.beginPath();
        c.moveTo(X(i - 1), Y(i - 1));
        c.lineTo(X(i), Y(i));
        c.stroke();
      }

      // corner number badges, offset outward from the track centroid
      c.font = `600 12px ${CANVAS_FONT}`;
      const { cx, cy } = fit;
      for (const corner of lap.corners) {
        const bx = X(corner.ap), by = Y(corner.ap);
        let dx = bx - cx, dy = by - cy;
        const L = Math.hypot(dx, dy) || 1;
        dx /= L; dy /= L;
        const lx = bx + dx * 16, ly = by + dy * 16;
        c.fillStyle = scoreColor(cornerApexG.get(corner.n) ?? 0, anchorG);
        c.beginPath(); c.arc(lx, ly, 10, 0, 7); c.fill();
        c.fillStyle = '#0a0a0a';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        // the track's turn number, not the per-lap detection index. The badge
        // has to mean the same bend when the rider switches lap tabs
        c.fillText(corner.turn ? String(corner.turn) : '·', lx, ly + 0.5);
      }

      // start/finish
      c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2;
      c.beginPath(); c.arc(X(start), Y(start), 4, 0, 7); c.fill(); c.stroke();
    });
    if (layer) ctx.drawImage(layer, 0, 0, w, h);

    // current position
    const ci = start + cursor;
    ctx.save();
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(ci), Y(ci), 6, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = scoreColor(metric[ci], anchorG); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(X(ci), Y(ci), 9, 0, 7); ctx.stroke();
  }, [analysis, lap, cursor, metric, cornerApexG, anchorG]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const geo = geoRef.current;
    const cv = ref.current;
    if (!geo || !cv) return;
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = 0, bd = Infinity;
    for (let i = lap.start; i <= lap.end; i++) {
      const d = (geo.X(i) - mx) ** 2 + (geo.Y(i) - my) ** 2;
      if (d < bd) { bd = d; best = i - lap.start; }
    }
    onSeek(best);
  }

  return (
    <canvas
      ref={ref}
      onClick={onClick}
      className="block w-full cursor-crosshair rounded-lg bg-zinc-950"
      style={{ aspectRatio: '16 / 10' }}
    />
  );
}
