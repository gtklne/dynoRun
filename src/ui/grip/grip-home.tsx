import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { packGripData } from '@/analysis/grip/storage';
import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import type { GripSessionSummary } from '@/api/repositories/types';
import type { Vehicle } from '@/shared/types';
import { formatDurationMs, formatRelativeTime } from '@/shared/format-time';
import { formatLapTime } from './format-lap';

export function GripHome() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GripSessionSummary[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await gripSessionRepository.list());
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    vehicleRepository.list().then(setVehicles).catch(() => {});
  }, []);

  const vehicleName = useMemo(() => new Map(vehicles.map((v) => [v.id, v.name])), [vehicles]);

  async function importFile(file: File) {
    setError(null);
    setImporting(true);
    try {
      const parsed = parseRaceboxCsv(await file.text());
      const created = await gripSessionRepository.create({ data: packGripData(parsed) });
      navigate(`/grip/sessions/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setBusy(id);
    setError(null);
    try {
      await gripSessionRepository.delete(id);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Grip Utilization</h1>
        <p className="mt-1 text-sm text-zinc-500">
          RaceBox track-session analyzer — traction-circle telemetry, per-corner grip usage, load transfer.
        </p>
      </div>

      <label
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void importFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-sky-500 bg-sky-950/20' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
        }`}
      >
        <span className="text-sm font-semibold text-zinc-200">
          {importing ? 'Analyzing session…' : 'Drop a RaceBox session CSV — or tap to choose'}
        </span>
        <span className="text-xs text-zinc-500">
          Parsed in your browser, then saved to your account so you can revisit and tune it anytime.
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
          className="sr-only"
        />
      </label>

      {error && (
        <div className="rounded-2xl border border-red-800/60 bg-red-950/40 p-3">
          <p className="text-xs text-red-300">⚠ {error}</p>
        </div>
      )}

      {sessions === null ? (
        <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-400">No sessions yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Export a session from the RaceBox app as CSV and drop it above to see where you have grip to spare.
          </p>
        </div>
      ) : (
        <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {sessions.map((s) => (
            <div key={s.id} className="space-y-2.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-200">
                    {s.label ?? s.track ?? 'Untitled session'}
                  </p>
                  {s.vehicle_id && vehicleName.get(s.vehicle_id) && (
                    <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-sky-400">
                      {vehicleName.get(s.vehicle_id)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {[s.label ? s.track : null, s.config, s.session_date].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="mt-1 font-mono text-[11px] text-zinc-600">
                  {s.lap_count} laps
                  {s.best_lap_s != null && <> · best {formatLapTime(s.best_lap_s)}</>}
                  {' · '}{formatDurationMs(s.duration_s * 1000)}
                  {' · '}{formatRelativeTime(s.created_at)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => navigate(`/grip/sessions/${s.id}`)}
                  className="rounded-lg border border-sky-800/40 bg-sky-500/10 py-2 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20"
                >
                  Open
                </button>
                <button
                  onClick={() => remove(s.id)}
                  disabled={busy === s.id}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-950/40 hover:text-red-400 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
