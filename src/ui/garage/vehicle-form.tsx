import { useMemo, useState } from 'react';
import type { VehicleKind, Drivetrain, Transmission } from '@/shared/types';
import type { NewVehicle } from '@/api/repositories/types';

const labelClass = 'text-xs font-medium text-zinc-400 uppercase tracking-wider';
const inputClass = 'w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm';
const fieldClass = 'flex flex-col gap-1.5';

const TRANSMISSIONS: ReadonlyArray<{ value: Transmission; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'dct', label: 'DCT' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'cvt', label: 'CVT' },
];

const MAX_YEAR = new Date().getFullYear() + 1;
const MIN_YEAR = 1900;

function hasEnrichedData(initial?: Partial<NewVehicle>): boolean {
  if (!initial) return false;
  return Boolean(
    initial.make ||
    initial.model ||
    (initial.year !== null && initial.year !== undefined) ||
    initial.tire_label ||
    (initial.power_hp_factory !== null && initial.power_hp_factory !== undefined) ||
    initial.transmission,
  );
}

function parseYear(raw: string): { value: number | null; valid: boolean } {
  const t = raw.trim();
  if (t === '') return { value: null, valid: true };
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { value: null, valid: false };
  if (n < MIN_YEAR || n > MAX_YEAR) return { value: null, valid: false };
  return { value: n, valid: true };
}

function parseFactoryHp(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

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

  const initiallyExpanded = useMemo(() => hasEnrichedData(initial), [initial]);
  const [detailsOpen, setDetailsOpen] = useState(initiallyExpanded);

  const [make, setMake] = useState(initial?.make ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [year, setYear] = useState(initial?.year != null ? String(initial.year) : '');
  const [tireLabel, setTireLabel] = useState(initial?.tire_label ?? '');
  const [powerHpFactory, setPowerHpFactory] = useState(
    initial?.power_hp_factory != null ? String(initial.power_hp_factory) : '',
  );
  const [transmission, setTransmission] = useState<Transmission | ''>(initial?.transmission ?? '');

  const yearParsed = parseYear(year);
  const yearError = !yearParsed.valid;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const massKg = parseFloat(mass);
    if (!name.trim() || !isFinite(massKg) || massKg <= 0) return;
    if (yearError) return;
    const makeTrim = make.trim();
    const modelTrim = model.trim();
    const tireTrim = tireLabel.trim();
    onSubmit({
      name: name.trim(),
      kind,
      mass_kg: massKg,
      drivetrain,
      frontal_area_m2: null,
      drag_coefficient: null,
      notes,
      make: makeTrim === '' ? null : makeTrim,
      model: modelTrim === '' ? null : modelTrim,
      year: yearParsed.value,
      tire_label: tireTrim === '' ? null : tireTrim,
      power_hp_factory: parseFactoryHp(powerHpFactory),
      transmission: transmission === '' ? null : transmission,
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

      <div className="border-t border-zinc-800 pt-3">
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="vf-details-panel"
          onClick={() => setDetailsOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left py-1 text-zinc-300 hover:text-zinc-100 transition-colors"
        >
          <span className="text-xs font-semibold uppercase tracking-wider">Details (optional)</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {detailsOpen && (
          <div id="vf-details-panel" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={fieldClass}>
                <label htmlFor="vf-make" className={labelClass}>Make</label>
                <input id="vf-make" className={inputClass} value={make} placeholder="VW" onChange={(e) => setMake(e.target.value)} />
              </div>
              <div className={fieldClass}>
                <label htmlFor="vf-model" className={labelClass}>Model</label>
                <input id="vf-model" className={inputClass} value={model} placeholder="Golf R" onChange={(e) => setModel(e.target.value)} />
              </div>
              <div className={fieldClass}>
                <label htmlFor="vf-year" className={labelClass}>Year</label>
                <input
                  id="vf-year"
                  className={`${inputClass} ${yearError ? 'border-red-500' : ''}`}
                  value={year}
                  inputMode="numeric"
                  placeholder="2020"
                  onChange={(e) => setYear(e.target.value)}
                  aria-invalid={yearError}
                />
                {yearError && (
                  <p className="text-xs text-red-400">Year must be {MIN_YEAR}–{MAX_YEAR}.</p>
                )}
              </div>
            </div>

            <div className={fieldClass}>
              <label htmlFor="vf-tire" className={labelClass}>Tires</label>
              <input
                id="vf-tire"
                className={inputClass}
                value={tireLabel}
                placeholder="e.g. Michelin Pilot Sport 4S 235/40R18"
                onChange={(e) => setTireLabel(e.target.value)}
              />
            </div>

            <div className={fieldClass}>
              <label htmlFor="vf-transmission" className={labelClass}>Transmission</label>
              <select
                id="vf-transmission"
                className={inputClass}
                value={transmission}
                onChange={(e) => setTransmission(e.target.value as Transmission | '')}
              >
                <option value="">—</option>
                {TRANSMISSIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className={fieldClass}>
              <label htmlFor="vf-factory-hp" className={labelClass}>Factory power</label>
              <div className="relative">
                <input
                  id="vf-factory-hp"
                  className={`${inputClass} pr-10`}
                  value={powerHpFactory}
                  inputMode="numeric"
                  placeholder="e.g. 300"
                  onChange={(e) => setPowerHpFactory(e.target.value)}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm pointer-events-none">hp</span>
              </div>
            </div>
          </div>
        )}
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
