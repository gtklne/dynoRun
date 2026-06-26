import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordingRepository } from '@/api/repositories/recording-repository';
import { isSensorRecording } from '@/sensors/recording';
import { setPendingReplay, useReplayState } from '@/sensors/replay-state';
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

export function ReplayLabIndex() {
  const navigate = useNavigate();
  const { last } = useReplayState();
  const [recordings, setRecordings] = useState<RecordingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecordings(await recordingRepository.list());
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text());
        if (!isSensorRecording(parsed)) {
          throw new Error('Not a valid sensor recording (missing version/kind/fixes fields)');
        }
        // Ephemeral: hand off in memory, never persist.
        setPendingReplay(parsed);
        navigate('/replay/local');
      } catch (err) {
        setError(String(err));
      } finally {
        e.target.value = '';
      }
    })();
  }

  function replayLast() {
    if (!last) return;
    setPendingReplay(last);
    navigate('/replay/local');
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Replay Lab</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Re-run any recording in real time — watch the dyno play out without driving. Replays are
          ephemeral: nothing is saved.
        </p>
      </div>

      {/* Quick sources */}
      <div className="grid grid-cols-1 gap-2">
        {last && (
          <button
            onClick={replayLast}
            className="flex items-center justify-between gap-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-800/40 rounded-2xl p-4 text-left transition-colors"
          >
            <div>
              <p className="text-amber-300 text-sm font-semibold">Replay last recording</p>
              <p className="text-zinc-500 text-xs mt-0.5">
                {last.kind} · {last.gps_fixes.length} GPS · {(last.duration_ms / 1000).toFixed(1)}s (in memory)
              </p>
            </div>
            <span className="text-amber-400" aria-hidden>→</span>
          </button>
        )}

        <label className="flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 rounded-2xl p-4 cursor-pointer hover:border-zinc-500 transition-colors">
          <svg className="text-zinc-500" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          </svg>
          <span className="text-zinc-300 text-sm font-medium">Upload recording JSON</span>
          <input type="file" accept="application/json" onChange={onUpload} className="sr-only" />
        </label>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-3">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {/* Stored recordings */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Stored recordings</p>
        {recordings === null ? (
          <div className="text-zinc-500 text-sm text-center py-8">Loading…</div>
        ) : recordings.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-zinc-400 text-sm">No recordings yet.</p>
            <p className="text-zinc-600 text-xs mt-1">Calibrations and runs are captured automatically.</p>
          </div>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:space-y-0">
            {recordings.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/replay/${r.id}`)}
                className="w-full text-left bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 rounded-2xl p-3 transition-colors flex items-center justify-between gap-3"
              >
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
                  <p className="text-zinc-600 text-[11px] font-mono mt-1">
                    {formatDuration(r.duration_ms)} · {r.gps_count} GPS · {r.motion_count} motion
                  </p>
                </div>
                <span className="text-zinc-500" aria-hidden>→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
