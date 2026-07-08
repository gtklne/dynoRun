import { useRef } from 'react';
import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { scoreColor } from './colors';
import { CANVAS_FONT, useCanvasDraw } from './use-canvas-draw';

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

  const ref = useCanvasDraw(({ ctx, w, h }) => {
    const { px, py } = analysis;
    const { start, end } = lap;
    ctx.clearRect(0, 0, w, h);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = start; i <= end; i++) {
      minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
      minY = Math.min(minY, py[i]); maxY = Math.max(maxY, py[i]);
    }
    const pad = 34;
    const s = Math.min((w - 2 * pad) / (maxX - minX), (h - 2 * pad) / (maxY - minY));
    const ox = (w - (maxX - minX) * s) / 2 - minX * s;
    const oy = (h - (maxY - minY) * s) / 2 - minY * s;
    const X = (i: number) => px[i] * s + ox;
    const Y = (i: number) => h - (py[i] * s + oy);
    geoRef.current = { X, Y };

    // track base (dark casing)
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 13;
    ctx.beginPath();
    for (let i = start; i <= end; i++) (i === start ? ctx.moveTo(X(i), Y(i)) : ctx.lineTo(X(i), Y(i)));
    ctx.stroke();

    // racing line coloured by the active metric
    ctx.lineWidth = 8;
    for (let i = start + 1; i <= end; i++) {
      ctx.strokeStyle = scoreColor((metric[i - 1] + metric[i]) / 2, anchorG);
      ctx.beginPath();
      ctx.moveTo(X(i - 1), Y(i - 1));
      ctx.lineTo(X(i), Y(i));
      ctx.stroke();
    }

    // corner number badges, offset outward from the track centroid
    ctx.font = `600 12px ${CANVAS_FONT}`;
    const cx = ((minX + maxX) / 2) * s + ox;
    const cy = h - (((minY + maxY) / 2) * s + oy);
    for (const c of lap.corners) {
      const bx = X(c.ap), by = Y(c.ap);
      let dx = bx - cx, dy = by - cy;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;
      const lx = bx + dx * 16, ly = by + dy * 16;
      ctx.fillStyle = scoreColor(cornerApexG.get(c.n) ?? 0, anchorG);
      ctx.beginPath(); ctx.arc(lx, ly, 10, 0, 7); ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.n), lx, ly + 0.5);
    }

    // start/finish
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X(start), Y(start), 4, 0, 7); ctx.fill(); ctx.stroke();

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
