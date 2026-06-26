import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordingRepository, toSensorRecording } from '@/api/repositories/recording-repository';
import { isSensorRecording } from '@/sensors/recording';
import type { RecordingSummary } from '@/api/repositories/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number): string {
  const total_s = Math.round(ms / 1000);
  const m = Math.floor(total_s / 60);
  const s = total_s % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function RecordingsScreen() {
  const navigate = useNavigate();
  const [recordings, setRecordings] = useState<RecordingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await recordingRepository.list();
      setRecordings(rows);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function download(id: string) {
    setBusy(id);
    setError(null);
    try {
      const full = await recordingRepository.get(id);
      if (!full) throw new Error('Recording not found');
      const payload = toSensorRecording(full);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = payload.recorded_at.replace(/[:.]/g, '-');
      a.download = `dynorun-${payload.kind}-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this recording? This cannot be undone.')) return;
    setBusy(id);
    setError(null);
    try {
      await recordingRepository.delete(id);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isSensorRecording(parsed)) {
        throw new Error('Not a valid sensor recording (missing version/kind/fixes fields)');
      }
      await recordingRepository.create({
        kind: parsed.kind,
        vehicle_id: parsed.meta.vehicle_id ?? null,
        calibration_id: parsed.meta.calibration_id ?? null,
        run_id: parsed.meta.run_id ?? null,
        gear_label: parsed.meta.gear_label ?? null,
        user_rpm: parsed.meta.user_rpm ?? null,
        label: parsed.meta.label ?? `Imported ${file.name}`,
        recorded_at: parsed.recorded_at,
        duration_ms: Math.round(parsed.duration_ms),
        data: { gps_fixes: parsed.gps_fixes, motion_fixes: parsed.motion_fixes },
      });
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Recordings</h1>
        <p className="text-zinc-500 text-sm mt-1">Raw sensor logs from every calibration and run. Replay any of them through the app to test without driving.</p>
      </div>

      {/* Upload */}
      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 rounded-xl p-4 cursor-pointer hover:border-zinc-500 transition-colors lg:max-w-md">
        <svg className="text-zinc-500" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 16 12 12 8 16"/>
          <line x1="12" y1="12" x2="12" y2="21"/>
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
        </svg>
        <span className="text-zinc-300 text-sm font-medium">
          {uploading ? 'Uploading…' : 'Import recording JSON'}
        </span>
        <input type="file" accept="application/json" onChange={onUpload} disabled={uploading} className="sr-only" />
      </label>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-3">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {/* List */}
      {recordings === null ? (
        <div className="text-zinc-500 text-sm text-center py-8">Loading…</div>
      ) : recordings.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-zinc-400 text-sm">No recordings yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Calibrations and runs will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:space-y-0">
          {recordings.map((r) => (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      r.kind === 'run' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
                    }`}>
                      {r.kind}
                    </span>
                    {r.gear_label && <span className="text-zinc-400 text-xs font-mono">{r.gear_label}</span>}
                    {r.user_rpm != null && <span className="text-zinc-500 text-xs font-mono">{r.user_rpm.toFixed(0)} RPM</span>}
                  </div>
                  <p className="text-zinc-300 text-sm mt-1.5 truncate">{r.label ?? formatDate(r.recorded_at)}</p>
                  {r.label && <p className="text-zinc-600 text-[11px] mt-0.5">{formatDate(r.recorded_at)}</p>}
                  <p className="text-zinc-600 text-[11px] font-mono mt-1">
                    {formatDuration(r.duration_ms)} · {r.gps_count} GPS · {r.motion_count} motion
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => navigate(`/replay/${r.id}`)}
                  className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium py-2 rounded-lg transition-colors text-xs border border-amber-800/40"
                >
                  Replay
                </button>
                <button
                  onClick={() => download(r.id)}
                  disabled={busy === r.id}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 font-medium py-2 rounded-lg transition-colors text-xs border border-zinc-700"
                >
                  Download
                </button>
                <button
                  onClick={() => remove(r.id)}
                  disabled={busy === r.id}
                  className="bg-zinc-800 hover:bg-red-950/40 disabled:opacity-50 text-zinc-400 hover:text-red-400 font-medium py-2 rounded-lg transition-colors text-xs border border-zinc-700"
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
