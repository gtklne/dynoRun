import type { RawSpeedSample } from '@/analysis/types';

/**
 * Tiny inline speed-vs-time preview for a detected pull. Pure SVG — uPlot
 * would be overkill for a read-only 30-point sparkline inside a list card.
 */
export function PullSparkline({ samples }: { samples: RawSpeedSample[] }) {
  if (samples.length < 2) return null;
  const w = 240;
  const h = 56;
  const pad = 3;
  const tMax = samples[samples.length - 1].t_ms || 1;
  const vMax = Math.max(...samples.map((s) => s.speed_mps)) || 1;
  const points = samples
    .map((s) => {
      const x = pad + (s.t_ms / tMax) * (w - 2 * pad);
      const y = h - pad - (s.speed_mps / vMax) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-14"
      preserveAspectRatio="none"
      role="img"
      aria-label="Speed trace of this pull"
    >
      <polyline
        points={`${pad},${h - pad} ${points} ${w - pad},${h - pad}`}
        fill="rgba(245, 158, 11, 0.12)"
        stroke="none"
      />
      <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
    </svg>
  );
}
