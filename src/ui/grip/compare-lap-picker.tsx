import type { GripLap } from '@/analysis/grip/types';
import type { GripSessionSummary } from '@/api/repositories/types';
import { PlateButton } from '@/ui/plate';
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
  /** lap key → series dash: identity on this plate is never hue alone */
  dashOf?: Map<string, number[]>;
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

/** The series mark a lap carries everywhere else on the sheet. */
function SeriesMark({ color, dash }: { color: string; dash?: number[] }) {
  return (
    <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="4"
        x2="18"
        y2="4"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={dash && dash.length ? dash.join(' ') : undefined}
      />
    </svg>
  );
}

export function CompareLapPicker({
  sessions,
  selected,
  colorOf,
  dashOf,
  refKey,
  onToggle,
  available,
  onAddSession,
  onRemoveSession,
  loading,
}: Props) {
  const full = selected.length >= MAX_COMPARE_LAPS;

  return (
    <section aria-label="Lap selection">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-label">
          Laps ({selected.length}/{MAX_COMPARE_LAPS})
        </h2>
        <select
          value=""
          disabled={loading || available.length === 0}
          onChange={(e) => e.target.value && onAddSession(e.target.value)}
          aria-label="Add a session"
          className="field max-w-[22rem]"
          style={{ width: 'auto' }}
        >
          <option value="">{available.length ? 'Add a session' : 'No other sessions'}</option>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label ?? s.track ?? 'Untitled'}
              {s.session_date ? ` · ${s.session_date}` : ''}
              {` · ${s.lap_count} laps`}
            </option>
          ))}
        </select>
      </div>

      <div className="box-frame">
        {sessions.length === 0 && (
          <p className="t-annotation px-3 py-4">
            {loading ? 'Loading sessions…' : 'Add a session above to start comparing laps.'}
          </p>
        )}

        {sessions.map((s, i) => (
          <div key={s.id} className={i > 0 ? 'rule-t' : undefined}>
            <div className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="t-data truncate text-sm">{s.title}</p>
                <p className="t-annotation mt-0.5 truncate">{s.subtitle}</p>
              </div>
              <PlateButton
                onClick={() => onRemoveSession(s.id)}
                className="shrink-0"
                style={{ minHeight: 32, padding: '0.25rem 0.625rem', fontSize: '0.6875rem' }}
              >
                Remove
              </PlateButton>
            </div>
            {s.laps.length === 0 ? (
              <p className="t-annotation px-3 pb-2">No timed laps in this session.</p>
            ) : (
              <div className="rule-t flex overflow-x-auto">
                {s.laps.map((lap, k) => {
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
                      data-active={on}
                      className={`ctl shrink-0 flex-col items-start gap-0.5 border-0 px-3 py-1.5 ${k > 0 ? 'rule-l' : ''}`}
                      style={{ minHeight: 48 }}
                    >
                      <span className="flex items-center gap-1.5">
                        {on && color && <SeriesMark color={color} dash={dashOf?.get(key)} />}
                        Lap {lap.num}
                        {isRef && (
                          <span style={{ fontSize: '0.5625rem', fontStretch: '75%', opacity: 0.72 }}>ref</span>
                        )}
                      </span>
                      <span
                        style={{
                          fontStretch: '100%',
                          fontWeight: 550,
                          fontSize: '0.8125rem',
                          letterSpacing: 'normal',
                          textTransform: 'none',
                        }}
                      >
                        {formatLapTime(lap.time)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {full && (
        <p className="t-annotation mt-1.5">
          Six is the cap: colour and dash pattern would start repeating past it.
        </p>
      )}
    </section>
  );
}
