import type { RunQuality, RunQualityFlag } from '@/analysis/run-quality';

const FLAG_LABELS: Record<RunQualityFlag, string> = {
  short_run: 'Run was too short for stable analysis',
  low_sample_density: 'GPS fix rate below 2 Hz',
  noisy_speed: 'Noisy speed signal',
  acceleration_spikes: 'Acceleration spikes (possible wheelspin or GPS glitch)',
  gps_dropouts: 'GPS dropouts (gaps > 500 ms)',
};

interface RunQualityBadgeProps {
  quality: RunQuality;
}

function DisclosureIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="square"
      aria-hidden="true"
      className="transition-transform group-open:rotate-180"
    >
      <polyline points="5 9 12 16 19 9" />
    </svg>
  );
}

/**
 * The sheet's own confidence stamp, and a real traffic light: a rating is a
 * judgement about whether the curve can be trusted, which is exactly what
 * go/caution/stop are reserved for. Good is green because a clean signal is a
 * fact worth stating on a sheet whose whole position is honesty about what a
 * measurement is worth; poor is red because the number below it is wrong.
 */
const TONE: Record<RunQuality['rating'], 'go' | 'caution' | 'stop'> = {
  good: 'go',
  fair: 'caution',
  poor: 'stop',
};

export function RunQualityBadge({ quality }: RunQualityBadgeProps) {
  const tone = TONE[quality.rating] ?? 'caution';

  return (
    <details className="group inline-block" data-rating={quality.rating}>
      <summary
        className="plane-2 flex cursor-pointer list-none select-none items-center gap-2 px-2.5 py-1.5"
        data-tone={tone}
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0"
          style={{ background: `var(--color-${tone})` }}
        />
        <span className="t-label" style={{ color: `var(--color-${tone})` }}>
          Signal {quality.rating}
        </span>
        <span className="t-data text-xs">{quality.score}/100</span>
        <DisclosureIcon />
      </summary>

      <div className="plane-2 mt-1 max-w-xs px-2.5 py-2">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="t-annotation">Samples</dt>
          <dd className="t-data text-right text-sm">{quality.sample_count}</dd>
          <dt className="t-annotation">Duration</dt>
          <dd className="t-data text-right text-sm">{quality.duration_s.toFixed(1)} s</dd>
          <dt className="t-annotation">Fix rate</dt>
          <dd className="t-data text-right text-sm">{quality.avg_fix_rate_hz.toFixed(1)} Hz</dd>
          <dt className="t-annotation">Max gap</dt>
          <dd className="t-data text-right text-sm">{Math.round(quality.max_gap_ms)} ms</dd>
        </dl>

        {quality.flags.length > 0 ? (
          <ul className="rule-t mt-2 space-y-1 pt-2">
            {quality.flags.map((flag) => (
              <li key={flag} className="t-body flex gap-2 text-xs leading-5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0"
                  style={{ background: `var(--color-${tone})` }}
                />
                <span style={{ color: 'var(--color-ink)' }}>{FLAG_LABELS[flag]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rule-t t-annotation mt-2 pt-2">No quality issues detected.</p>
        )}
      </div>
    </details>
  );
}
