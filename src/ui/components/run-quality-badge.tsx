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
 * The sheet's own confidence stamp. A rating is a decision input, not
 * decoration, so it takes a ruled box and the caution ink only when the run
 * actually needs reading twice; a good run stays in plain ink rather than
 * spending a second colour on "everything is fine".
 */
export function RunQualityBadge({ quality }: RunQualityBadgeProps) {
  const poor = quality.rating === 'poor';
  const fair = quality.rating === 'fair';
  const flagged = poor || fair;

  return (
    <details className="group inline-block" data-rating={quality.rating}>
      <summary
        className="box flex cursor-pointer list-none select-none items-center gap-2 px-2.5 py-1.5"
        style={
          flagged
            ? { borderColor: 'var(--color-caution)', background: 'var(--color-caution-tint)' }
            : undefined
        }
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0"
          style={{ background: flagged ? 'var(--color-caution)' : 'var(--color-ink)' }}
        />
        <span className="t-label" style={{ color: 'var(--color-ink)' }}>
          Signal {quality.rating}
        </span>
        <span className="t-data text-xs">{quality.score}/100</span>
        <DisclosureIcon />
      </summary>

      <div className="box mt-2 max-w-xs px-3 py-2.5">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
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
          <ul className="rule-t mt-2.5 space-y-1.5 pt-2.5">
            {quality.flags.map((flag) => (
              <li key={flag} className="t-body flex gap-2 text-xs leading-5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 shrink-0"
                  style={{ background: 'var(--color-caution)' }}
                />
                <span style={{ color: 'var(--color-ink)' }}>{FLAG_LABELS[flag]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rule-t t-annotation mt-2.5 pt-2.5">No quality issues detected.</p>
        )}
      </div>
    </details>
  );
}
