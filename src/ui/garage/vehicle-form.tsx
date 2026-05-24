import { useState } from 'react';
import type { VehicleKind, Drivetrain } from '@/shared/types';
import type { NewVehicle } from '@/storage/repositories/vehicle-repository';

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
    <form onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as VehicleKind)}>
          <option value="car">Car</option>
          <option value="motorcycle">Motorcycle</option>
        </select>
      </label>
      <label>
        Mass (kg, total moving: vehicle + driver + fuel)
        <input value={mass} inputMode="decimal" onChange={(e) => setMass(e.target.value)} />
      </label>
      <label>
        Drivetrain
        <select value={drivetrain} onChange={(e) => setDrivetrain(e.target.value as Drivetrain)}>
          <option value="fwd">FWD</option>
          <option value="rwd">RWD</option>
          <option value="awd">AWD</option>
          <option value="chain">Chain</option>
          <option value="shaft">Shaft</option>
        </select>
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div>
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
