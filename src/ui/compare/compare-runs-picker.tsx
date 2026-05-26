import type { Run } from '@/shared/types';
import { formatRelativeTime } from '@/shared/format-time';
import { convertPower, formatPower, type PowerUnit } from '@/shared/format-power';
import { ConditionsChips } from '@/ui/run/conditions-chips';

interface Props {
  runs: Run[];
  selectedIds: Set<string>;
  onToggle: (runId: string) => void;
  unit: PowerUnit;
  bestRunId: string | null;
  /** Best peak among currently-selected runs (in kW). Used to show per-row deltas. */
  bestSelectedKw: number | null;
  /** ID of the run that owns `bestSelectedKw` — skip its own delta row. */
  bestSelectedRunId: string | null;
}

function formatDeltaKw(deltaKw: number, unit: PowerUnit): string {
  const v = convertPower(deltaKw, unit);
  const decimals = unit === 'kW' ? 1 : 0;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±';
  return `${sign}${Math.abs(v).toFixed(decimals)} ${unit}`;
}

export function CompareRunsPicker({
  runs,
  selectedIds,
  onToggle,
  unit,
  bestRunId,
  bestSelectedKw,
  bestSelectedRunId,
}: Props) {
  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const checked = selectedIds.has(r.id);
        const isBest = r.id === bestRunId;
        const headline = `${r.gear_label} · ${formatRelativeTime(r.started_at)} · ${formatPower(r.peak_power_kw, unit)}`;
        const secondary = r.title ?? (r.notes || null);
        const showDelta =
          bestSelectedKw != null &&
          r.peak_power_kw != null &&
          r.id !== bestSelectedRunId;
        const deltaKw =
          showDelta && r.peak_power_kw != null && bestSelectedKw != null
            ? r.peak_power_kw - bestSelectedKw
            : null;
        const deltaColor =
          deltaKw == null
            ? ''
            : deltaKw > 0
              ? 'text-emerald-400'
              : deltaKw < 0
                ? 'text-rose-400'
                : 'text-zinc-500';
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onToggle(r.id)}
            aria-label={headline}
            className={`w-full text-left bg-zinc-900 border rounded-2xl p-4 flex items-center gap-3 transition-colors ${
              checked ? 'border-amber-600/60 bg-amber-950/20' : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`w-5 h-5 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
              checked ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'
            }`}>
              {checked && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium truncate ${checked ? 'text-zinc-100' : 'text-zinc-300'}`}>
                {headline}
                {deltaKw != null && (
                  <span className={`ml-2 text-xs font-semibold ${deltaColor}`}>
                    {formatDeltaKw(deltaKw, unit)}
                  </span>
                )}
                {isBest && <span className="text-amber-400 ml-2">★ Best</span>}
              </p>
              {secondary && (
                <p className="text-zinc-500 text-xs mt-0.5 italic truncate">{secondary}</p>
              )}
              <div className="mt-1">
                <ConditionsChips conditions={r.conditions} size="sm" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
