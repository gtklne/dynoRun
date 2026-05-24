import { useState } from 'react';

export interface GearInput {
  gear_label: string;
  user_rpm: number;
}

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
    <form onSubmit={submit}>
      <h2>Step 1 — Choose gear and target RPM</h2>
      <label>
        Gear
        <input value={gearLabel} onChange={(e) => setGearLabel(e.target.value)} />
      </label>
      <label>
        Target RPM (you'll hold this steady)
        <input value={rpm} inputMode="decimal" onChange={(e) => setRpm(e.target.value)} />
      </label>
      <button type="submit">Next</button>
    </form>
  );
}
