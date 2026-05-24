import { useState } from 'react';

export interface GearInput {
  gear_label: string;
  user_rpm: number;
}

const labelClass = 'text-xs font-medium text-zinc-400 uppercase tracking-wider';
const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm';

export function CalibrationStepGear({ onSubmit }: { onSubmit: (g: GearInput) => void }) {
  const [gearLabel, setGearLabel] = useState('3rd');
  const [rpm, setRpm] = useState('3000');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = parseFloat(rpm);
    if (!gearLabel.trim() || !isFinite(r) || r <= 0) return;
    onSubmit({ gear_label: gearLabel.trim(), user_rpm: r });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-1">
        <p className="text-zinc-100 font-medium text-sm">Choose the gear you'll use for the run</p>
        <p className="text-zinc-500 text-xs">You'll hold a steady RPM in this gear to calibrate the speed/RPM ratio.</p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cal-gear" className={labelClass}>Gear</label>
          <input
            id="cal-gear"
            className={inputClass}
            value={gearLabel}
            placeholder="e.g. 3rd, 4th"
            onChange={(e) => setGearLabel(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cal-rpm" className={labelClass}>Target RPM</label>
          <input
            id="cal-rpm"
            className={inputClass}
            value={rpm}
            inputMode="decimal"
            placeholder="e.g. 3000"
            onChange={(e) => setRpm(e.target.value)}
          />
          <p className="text-zinc-600 text-xs">You'll hold this RPM steady during calibration</p>
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors"
      >
        Next →
      </button>
    </form>
  );
}
