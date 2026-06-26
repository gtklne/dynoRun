import { useNavigate } from 'react-router-dom';
import type { Calibration } from '@/shared/types';
import { useReplayState, setPendingReplay } from '@/sensors/replay-state';
import { describeRecording } from '@/sensors/recording';

export function CalibrationStepConfirm({ calibration, onDone }: { calibration: Calibration; onDone: () => void }) {
  const navigate = useNavigate();
  const { last: lastRecording } = useReplayState();
  const recordingMatches = lastRecording?.kind === 'calibration' && lastRecording.meta.vehicle_id === calibration.vehicle_id;

  function downloadRecording() {
    if (!lastRecording) return;
    const blob = new Blob([JSON.stringify(lastRecording, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = lastRecording.recorded_at.replace(/[:.]/g, '-');
    a.download = `dynorun-${lastRecording.kind}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function useRecordingForReplay() {
    if (!lastRecording) return;
    setPendingReplay(lastRecording);
    navigate('/replay/local');
  }

  return (
    <div className="space-y-5">
      {/* Success header */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <svg className="text-emerald-400" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-zinc-100">Calibration saved</p>
          <p className="text-zinc-500 text-sm mt-1">Gear <span className="text-amber-400 font-semibold">{calibration.gear_label}</span> is ready for dyno runs</p>
        </div>
      </div>

      {/* Data card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Calibration data</p>
        </div>
        <div className="divide-y divide-zinc-800">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-400 text-sm">Gear</span>
            <span className="text-zinc-100 font-medium text-sm">{calibration.gear_label}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-400 text-sm">RPM</span>
            <span className="text-zinc-100 font-medium text-sm tabular-nums">{calibration.rpm.toFixed(0)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-400 text-sm">Speed</span>
            <span className="text-zinc-100 font-medium text-sm tabular-nums">{calibration.speed_kmh.toFixed(1)} km/h</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-zinc-400 text-sm">Rollout</span>
            <span className="text-zinc-100 font-medium text-sm tabular-nums">{calibration.rollout_m_per_rev.toFixed(4)} m/rev</span>
          </div>
        </div>
      </div>

      {/* Raw sensor recording */}
      {recordingMatches && lastRecording && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Raw sensor recording</p>
            <p className="text-zinc-400 text-xs mt-1.5 font-mono">{describeRecording(lastRecording)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadRecording}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
            >
              Download JSON
            </button>
            <button
              onClick={useRecordingForReplay}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
            >
              Use for replay
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onDone}
        className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors"
      >
        Done
      </button>
    </div>
  );
}
