import type { RawSpeedSample } from '@/analysis/types';
import { mpsToKmh } from '@/shared/units';
import { ProfileView, usePlateInk } from '@/ui/plate';

/**
 * Speed profile of one detected pull, drawn from zero so the shape of the
 * acceleration is what the rider compares between candidates. Pure SVG: uPlot
 * would be overkill for a read-only 30-point strip inside a picker row.
 *
 * The caption carries the scale because the strip is redrawn to fit each pull:
 * without it two pulls of different peak speed would look identical.
 */
export function PullSparkline({ samples }: { samples: RawSpeedSample[] }) {
  const ink = usePlateInk();
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
    <ProfileView
      label="Pull profile"
      axis={`0-${mpsToKmh(vMax).toFixed(0)} km/h over ${(tMax / 1000).toFixed(1)} s`}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="block h-14 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Speed trace of this pull, up to ${mpsToKmh(vMax).toFixed(0)} km/h`}
      >
        <line
          x1={pad}
          y1={h - pad}
          x2={w - pad}
          y2={h - pad}
          stroke={ink.ruleFaint}
          strokeWidth="1"
        />
        <polyline points={points} fill="none" stroke={ink.procedure} strokeWidth="1.5" />
      </svg>
    </ProfileView>
  );
}
