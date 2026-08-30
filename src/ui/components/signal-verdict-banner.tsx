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
 * raw-trace card below already reports the all-clear, and a green banner on
 * every good run would train riders to skim past the red one.
 *
 * This is the plate's advisory box, so it takes caution ink whichever verdict
 * it carries. Corrupt and suspect are separated by the word and by the frame
 * weight, not by inventing a second alarm colour.
 */
export function SignalVerdictBanner({ integrity, action }: Props) {
  if (integrity.verdict === 'ok') return null;
  const corrupt = integrity.verdict === 'corrupt';

  return (
    <div
      role="alert"
      className="box px-3 py-3"
      style={{
        borderColor: 'var(--color-caution)',
        borderWidth: corrupt ? 'var(--rule-frame)' : 'var(--rule-hair)',
        background: 'var(--color-caution-tint)',
      }}
      data-verdict={integrity.verdict}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-3.5 w-3.5 shrink-0"
          style={{ background: 'var(--color-caution)' }}
        />
        <div className="min-w-0">
          <p className="t-label" style={{ color: 'var(--color-ink)' }}>
            {integrity.headline}
          </p>
          <p className="t-body mt-1.5 text-[0.8125rem] leading-6" style={{ color: 'var(--color-ink)' }}>
            {integrity.advice}
          </p>
        </div>
      </div>

      <ul className="rule-t mt-3 pt-2.5">
        {integrity.faults.map((f, i) => (
          <li key={`${f.kind}-${f.t_ms}-${i}`} className="flex gap-3 py-1 text-xs">
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

      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
