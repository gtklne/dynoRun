import type { RawSpeedSample } from '@/analysis/types';
import { mpsToKmh } from '@/shared/units';

/**
 * Speed trace of one steady hold, with the y axis zoomed to the hold's own
 * range instead of to zero. Scaled from zero a good hold is a flat line across
 * the top of the box, which tells the rider nothing; the wobble is the whole
 * thing being judged, so that is what gets the vertical space.
 */
export function PlateauSparkline({ samples }: { samples: RawSpeedSample[] }) {
  if (samples.length < 2) return null;
  const w = 240;
  const h = 44;
  const pad = 4;
  const speeds = samples.map((s) => mpsToKmh(s.speed_mps));
  const lo = Math.min(...speeds);
  const hi = Math.max(...speeds);
  // A dead-flat hold has no range to scale to, so give it a nominal 1 km/h band
  // and draw it down the middle rather than dividing by zero.
  const span = hi - lo > 0.2 ? hi - lo : 1;
  const mid = (hi + lo) / 2;
  const tMax = samples[samples.length - 1].t_ms || 1;
  const points = samples
    .map((s, i) => {
      const x = pad + (s.t_ms / tMax) * (w - 2 * pad);
      const y = h / 2 - ((speeds[i] - mid) / span) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-11"
      preserveAspectRatio="none"
      role="img"
      aria-label="Speed trace of this steady hold"
    >
      <line
        x1={pad}
        y1={h / 2}
        x2={w - pad}
        y2={h / 2}
        stroke="rgba(161, 161, 170, 0.25)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
    </svg>
  );
}
