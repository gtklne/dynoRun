import type { GripLap } from '@/analysis/grip/types';
import type { GripSessionSummary } from '@/api/repositories/types';
import { formatLapTime } from './format-lap';
import { MAX_COMPARE_LAPS } from './compare-colors';

export interface PickerSession {
  id: string;
  title: string;
  subtitle: string;
  laps: GripLap[];
}

interface Props {
  sessions: PickerSession[];
  /** ordered selection of `${sessionId}:${lapNum}` keys */
  selected: string[];
  colorOf: Map<string, string>;
  refKey: string | null;
  onToggle: (key: string) => void;
  /** sessions in the library that are not loaded yet */
  available: GripSessionSummary[];
  onAddSession: (id: string) => void;
  onRemoveSession: (id: string) => void;
  loading: boolean;
}

export function lapKey(sessionId: string, lapNum: number): string {
  return `${sessionId}:${lapNum}`;
}

export function CompareLapPicker({
  sessions,
  selected,
  colorOf,
  refKey,
  onToggle,
  available,
  onAddSession,
  onRemoveSession,
  loading,
}: Props) {
  const full = selected.length >= MAX_COMPARE_LAPS;

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Laps ({selected.length}/{MAX_COMPARE_LAPS})
        </h2>
        <select
          value=""
          disabled={loading || available.length === 0}
          onChange={(e) => e.target.value && onAddSession(e.target.value)}
          aria-label="Add a session"
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-300 outline-none focus:border-sky-600 disabled:opacity-50"
        >
          <option value="">{available.length ? '+ Add a session…' : 'No other sessions'}</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label ?? s.track ?? 'Untitled'}
              {s.session_date ? ` · ${s.session_date}` : ''}
              {` · ${s.lap_count} laps`}
            </option>
          ))}
        </select>
      </div>

      {sessions.length === 0 && (
        <p className="py-2 text-sm text-zinc-500">
          {loading ? 'Loading sessions…' : 'Add a session above to start comparing laps.'}
        </p>
      )}

      {sessions.map((s) => (
        <div key={s.id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-200">{s.title}</p>
              <p className="truncate text-[11px] text-zinc-500">{s.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemoveSession(s.id)}
              className="shrink-0 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-red-800 hover:text-red-400"
            >
              Remove
            </button>
          </div>
          {s.laps.length === 0 ? (
            <p className="text-[11px] text-zinc-600">No timed laps in this session.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {s.laps.map((lap) => {
                const key = lapKey(s.id, lap.num);
                const on = selected.includes(key);
                const isRef = key === refKey;
                const color = colorOf.get(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Lap ${lap.num}, ${formatLapTime(lap.time)}${isRef ? ', reference' : ''}`}
                    disabled={!on && full}
                    onClick={() => onToggle(key)}
                    style={on && color ? { borderColor: color } : undefined}
                    className={`flex min-w-[76px] flex-col items-start rounded-lg border px-2.5 py-1.5 text-left leading-tight transition-colors ${
                      on
                        ? 'bg-[#14202e] text-zinc-100'
                        : full
                          ? 'border-zinc-800 bg-zinc-900 text-zinc-600'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-bold">
                      {on && color && (
                        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                      )}
                      Lap {lap.num}
                      {isRef && <span className="text-[9px] font-semibold uppercase text-zinc-400">ref</span>}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums">{formatLapTime(lap.time)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
