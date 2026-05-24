import type { Run } from '@/shared/types';

interface Props {
  runs: Run[];
  selectedIds: Set<string>;
  onToggle: (runId: string) => void;
}

export function CompareRunsPicker({ runs, selectedIds, onToggle }: Props) {
  return (
    <div className="space-y-2">
      {runs.map((r) => {
        const label = r.notes || `${r.gear_label} · ${r.started_at}`;
        const checked = selectedIds.has(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onToggle(r.id)}
            aria-label={label}
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
            <span className={`text-sm font-medium truncate ${checked ? 'text-zinc-100' : 'text-zinc-400'}`}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
