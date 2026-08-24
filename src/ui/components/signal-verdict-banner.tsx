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
 */
export function SignalVerdictBanner({ integrity, action }: Props) {
  if (integrity.verdict === 'ok') return null;
  const corrupt = integrity.verdict === 'corrupt';

  const tone = corrupt
    ? 'border-red-500/50 bg-red-500/10'
    : 'border-amber-500/40 bg-amber-500/10';
  const title = corrupt ? 'text-red-300' : 'text-amber-300';

  return (
    <div className={`border rounded-2xl p-4 space-y-3 ${tone}`} role="alert">
      <div className="flex items-start gap-2.5">
        <span className={`font-bold shrink-0 ${title}`} aria-hidden="true">!</span>
        <div className="space-y-1.5">
          <p className={`font-semibold text-sm ${title}`}>{integrity.headline}</p>
          <p className="text-zinc-300 text-xs leading-relaxed">{integrity.advice}</p>
        </div>
      </div>

      <ul className="space-y-1 text-[11px] tabular-nums">
        {integrity.faults.map((f, i) => (
          <li key={`${f.kind}-${f.t_ms}-${i}`} className="flex gap-2 text-zinc-400">
            <span className="text-zinc-600 shrink-0 w-12 text-right">
              {(f.t_ms / 1000).toFixed(1)} s
            </span>
            <span>
              <span className="text-zinc-300">{FAULT_LABEL[f.kind] ?? f.kind}</span>
              {': '}
              {f.detail}
              {!f.analysed && <span className="text-zinc-600"> (outside the measured window)</span>}
            </span>
          </li>
        ))}
      </ul>

      {action}
    </div>
  );
}
