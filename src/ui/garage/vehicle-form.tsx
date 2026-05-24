import { useState } from 'react';
import type { VehicleKind, Drivetrain } from '@/shared/types';
import type { NewVehicle } from '@/api/repositories/types';

const labelClass = 'text-xs font-medium text-zinc-400 uppercase tracking-wider';
const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm';
const fieldClass = 'flex flex-col gap-1.5';

export function VehicleForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<NewVehicle>;
  onSubmit: (v: NewVehicle) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<VehicleKind>(initial?.kind ?? 'car');
  const [mass, setMass] = useState(String(initial?.mass_kg ?? ''));
  const [drivetrain, setDrivetrain] = useState<Drivetrain>(initial?.drivetrain ?? 'fwd');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const massKg = parseFloat(mass);
    if (!name.trim() || !isFinite(massKg) || massKg <= 0) return;
    onSubmit({
      name: name.trim(),
      kind,
      mass_kg: massKg,
      drivetrain,
      frontal_area_m2: null,
      drag_coefficient: null,
      notes,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={fieldClass}>
        <label htmlFor="vf-name" className={labelClass}>Name</label>
        <input id="vf-name" className={inputClass} value={name} placeholder="e.g. Golf R" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className={fieldClass}>
        <label htmlFor="vf-kind" className={labelClass}>Kind</label>
        <select id="vf-kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as VehicleKind)}>
          <option value="car">Car</option>
          <option value="motorcycle">Motorcycle</option>
        </select>
      </div>

      <div className={fieldClass}>
        <label htmlFor="vf-mass" className={labelClass}>Mass (kg)</label>
        <input id="vf-mass" className={inputClass} value={mass} inputMode="decimal" placeholder="Total: vehicle + driver + fuel" onChange={(e) => setMass(e.target.value)} />
      </div>

      <div className={fieldClass}>
        <label htmlFor="vf-drivetrain" className={labelClass}>Drivetrain</label>
        <select id="vf-drivetrain" className={inputClass} value={drivetrain} onChange={(e) => setDrivetrain(e.target.value as Drivetrain)}>
          <option value="fwd">FWD</option>
          <option value="rwd">RWD</option>
          <option value="awd">AWD</option>
          <option value="chain">Chain (motorcycle)</option>
          <option value="shaft">Shaft (motorcycle)</option>
        </select>
      </div>

      <div className={fieldClass}>
        <label htmlFor="vf-notes" className={labelClass}>Notes</label>
        <textarea
          id="vf-notes"
          className={`${inputClass} resize-none`}
          rows={3}
          value={notes}
          placeholder="Optional — mods, baseline, etc."
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3 rounded-xl transition-colors text-sm"
        >
          Save vehicle
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-3 rounded-xl transition-colors border border-zinc-700 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
