import type { Calibration } from '@/shared/types';

export function CalibrationStepConfirm({ calibration, onDone }: { calibration: Calibration; onDone: () => void }) {
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

      <button
        onClick={onDone}
        className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors"
      >
        Done
      </button>
    </div>
  );
}
