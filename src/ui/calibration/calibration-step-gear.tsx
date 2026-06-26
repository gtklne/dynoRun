import { useState } from 'react';

export interface GearInput {
  gear_label: string;
  user_rpm: number;
}

const labelClass = 'text-xs font-medium text-zinc-400 uppercase tracking-wider';
const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm';
const chipBase = 'px-4 py-2.5 rounded-xl text-sm transition-colors';
const chipInactive = 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700';
const chipActive = 'bg-amber-500 text-zinc-950 border border-amber-500 font-semibold';
const stepperBtnClass = 'flex-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-200 font-mono text-sm py-2 rounded-lg border border-zinc-700 transition-colors';

const GEAR_PRESETS = ['2nd', '3rd', '4th', '5th', '6th'] as const;

type GearMode = 'preset' | 'custom';

export function CalibrationStepGear({ onSubmit }: { onSubmit: (g: GearInput) => void }) {
  const [mode, setMode] = useState<GearMode>('preset');
  const [gearLabel, setGearLabel] = useState('3rd');
  const [rpm, setRpm] = useState('3000');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = parseFloat(rpm);
    if (!gearLabel.trim() || !isFinite(r) || r <= 0) return;
    onSubmit({ gear_label: gearLabel.trim(), user_rpm: r });
  }

  function selectPreset(label: string) {
    setMode('preset');
    setGearLabel(label);
  }

  function selectCustom() {
    setMode('custom');
    if (GEAR_PRESETS.includes(gearLabel as typeof GEAR_PRESETS[number])) {
      setGearLabel('');
    }
  }

  function bump(delta: number) {
    setRpm((prev) => String(Math.max(0, (parseFloat(prev) || 0) + delta)));
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-1">
        <p className="text-zinc-100 font-medium text-sm">Choose the gear you'll use for the run</p>
        <p className="text-zinc-500 text-xs">You'll hold a steady RPM in this gear to calibrate the speed/RPM ratio.</p>
      </div>

      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <div className="flex flex-col gap-2">
          <span className={labelClass}>Gear</span>
          <div className="flex gap-2 flex-wrap">
            {GEAR_PRESETS.map((preset) => {
              const active = mode === 'preset' && gearLabel === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={`${chipBase} ${active ? chipActive : chipInactive}`}
                >
                  {preset}
                </button>
              );
            })}
            <button
              type="button"
              onClick={selectCustom}
              className={`${chipBase} ${mode === 'custom' ? chipActive : chipInactive}`}
            >
              Custom
            </button>
          </div>
          {mode === 'custom' && (
            <input
              id="cal-gear"
              className={inputClass}
              value={gearLabel}
              placeholder="e.g. 1st, Top"
              onChange={(e) => setGearLabel(e.target.value)}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="cal-rpm" className={labelClass}>Target RPM</label>
          <input
            id="cal-rpm"
            className={inputClass}
            value={rpm}
            inputMode="decimal"
            placeholder="e.g. 3000"
            onChange={(e) => setRpm(e.target.value)}
          />
          <div className="flex items-stretch gap-2">
            <button type="button" onClick={() => bump(-250)} className={stepperBtnClass}>−250</button>
            <button type="button" onClick={() => bump(-100)} className={stepperBtnClass}>−100</button>
            <button type="button" onClick={() => bump(+100)} className={stepperBtnClass}>+100</button>
            <button type="button" onClick={() => bump(+250)} className={stepperBtnClass}>+250</button>
          </div>
          <p className="text-zinc-600 text-xs">You'll hold this RPM steady during calibration.</p>
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors lg:block lg:w-fit lg:ml-auto lg:px-8"
      >
        Next →
      </button>
    </form>
  );
}
