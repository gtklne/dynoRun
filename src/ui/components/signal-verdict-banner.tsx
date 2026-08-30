import type { SignalIntegrity } from '@/analysis/signal-integrity';

const FAULT_LABEL: Record<string, string> = {
  impossible_step: 'Impossible step',
  stall_and_catchup: 'Speed froze, then caught up',
  dropout: 'Dropout',
};

interface Props {
  integrity: SignalIntegrity;
  /** Rendered under the advice, e.g. the discard action. */
  action?: React.ReactNode;
}

/**
 * The verdict on whether a run's speed signal fabricated its power number.
 *
 * Only rendered for 'corrupt' and 'suspect'. A clean run says nothing here: the
 * raw-trace card below already reports the all-clear, and a banner on every
 * good run would train riders to skim past the bad one.
 *
 * Corrupt is red and suspect is amber, which is the traffic light meaning
 * exactly what it means on a circuit: red is a number the vehicle never made,
 * amber is one to read twice. They are separated by hue AND by the headline
 * wording, so the distinction survives a colour-blind reader.
 */
export function SignalVerdictBanner({ integrity, action }: Props) {
  if (integrity.verdict === 'ok') return null;
  const tone = integrity.verdict === 'corrupt' ? 'stop' : 'caution';

  return (
    <div
      role="alert"
      className="block-body"
      style={{ background: `var(--color-${tone}-plane)` }}
      data-verdict={integrity.verdict}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-3.5 w-3.5 shrink-0"
          style={{ background: `var(--color-${tone})` }}
        />
        <div className="min-w-0">
          <p className="t-label" style={{ color: `var(--color-${tone})` }}>
            {integrity.headline}
          </p>
          <p className="t-body mt-1 text-[0.8125rem] leading-6" style={{ color: 'var(--color-ink)' }}>
            {integrity.advice}
          </p>
        </div>
      </div>

      <ul className="rule-t mt-2.5 pt-2">
        {integrity.faults.map((f, i) => (
          <li key={`${f.kind}-${f.t_ms}-${i}`} className="flex gap-3 py-0.5 text-xs">
            <span className="t-data w-14 shrink-0 text-right text-xs">
              {(f.t_ms / 1000).toFixed(1)} s
            </span>
            <span style={{ color: 'var(--color-ink-2)' }}>
              <span className="t-data text-xs">{FAULT_LABEL[f.kind] ?? f.kind}</span>
              {': '}
              {f.detail}
              {!f.analysed && <span className="t-annotation ml-1">outside the measured window</span>}
            </span>
          </li>
        ))}
      </ul>

      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}
