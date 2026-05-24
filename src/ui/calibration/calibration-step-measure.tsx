import { useEffect, useRef, useState } from 'react';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { CalibrationController } from '@/run/calibration-controller';
import { useSpeedSourceFactory } from './speed-source-context';
import type { GearInput } from './calibration-step-gear';
import type { Calibration } from '@/shared/types';
import type { CalibrationState } from '@/run/types';

interface Props {
  vehicleId: string;
  gear: GearInput;
  onConfirmed: (cal: Calibration) => void;
  onCancel: () => void;
}

export function CalibrationStepMeasure({ vehicleId, gear, onConfirmed, onCancel }: Props) {
  const speedSourceFactory = useSpeedSourceFactory();
  const [state, setState] = useState<CalibrationState>({ kind: 'idle' });
  const ctrlRef = useRef<CalibrationController | null>(null);

  useEffect(() => {
    return () => {
      ctrlRef.current?.stop().catch(() => {});
      ctrlRef.current = null;
    };
  }, []);

  async function start() {
    const sensor = await speedSourceFactory();
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository,
      onStateChange: setState,
    });
    ctrlRef.current = ctrl;
    await ctrl.start({ gear_label: gear.gear_label, user_rpm: gear.user_rpm });
  }

  async function confirm() {
    if (!ctrlRef.current) return;
    const cal = await ctrlRef.current.confirm();
    await ctrlRef.current.stop();
    onConfirmed(cal);
  }

  return (
    <div className="space-y-5">
      {/* Instruction card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-1">
        <p className="text-zinc-100 font-medium text-sm">
          Hold steady at {gear.user_rpm.toLocaleString()} RPM in {gear.gear_label}
        </p>
        <p className="text-zinc-500 text-xs">
          Cruise at a constant speed in {gear.gear_label} gear. The app captures your speed when it stabilizes.
        </p>
      </div>

      {/* State display */}
      {state.kind === 'idle' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
            <svg className="text-zinc-500" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <p className="text-zinc-500 text-sm">Ready when you are</p>
        </div>
      )}

      {state.kind === 'measuring' && (
        <div className="bg-zinc-900 border border-amber-800/40 rounded-2xl p-6 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-amber-400 font-semibold text-sm">Measuring…</p>
            <p className="text-zinc-500 text-xs mt-1">Hold the RPM steady</p>
          </div>
        </div>
      )}

      {state.kind === 'stable' && (
        <div className="bg-zinc-900 border border-emerald-800/40 rounded-2xl p-6 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="text-emerald-400" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Captured speed</p>
            <p className="text-4xl font-bold text-zinc-100 tabular-nums">
              {state.captured_speed_kmh.toFixed(1)}
              <span className="text-lg font-normal text-zinc-400 ml-1">km/h</span>
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        {state.kind === 'idle' && (
          <button
            onClick={start}
            className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors"
          >
            Start measurement
          </button>
        )}
        {state.kind === 'stable' && (
          <button
            onClick={confirm}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            Save calibration
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-3 rounded-xl transition-colors border border-zinc-700 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
