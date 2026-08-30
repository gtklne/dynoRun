import { useMemo, useState } from 'react';
import type { VehicleKind, Drivetrain, Transmission, BodyShape } from '@/shared/types';
import type { NewVehicle } from '@/api/repositories/types';
import { shapesForKind, shapePreset } from '@/shared/body-shapes';
import { PlateButton, PlateField } from '@/ui/plate';

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

function DisclosureIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="5 9 12 16 19 9" />
    </svg>
  );
}

/**
 * A unit gutter welded to the field, the way an instrument prints its unit on
 * the bezel rather than floating it over the reading. Absolutely positioning
 * the unit inside the input meant the value could slide underneath it.
 */
function UnitField({ unit, children }: { unit: string; children: React.ReactNode }) {
  return (
    <div className="flex items-stretch">
      {children}
      <span
        aria-hidden="true"
        className="t-annotation flex shrink-0 items-center px-2.5"
        style={{
          borderBottom: 'var(--rule-strong) solid var(--color-grid-strong)',
          background: 'var(--color-plane-2)',
        }}
      >
        {unit}
      </span>
    </div>
  );
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
  const [bodyShape, setBodyShape] = useState<BodyShape | ''>(initial?.body_shape ?? '');
  const [frontalArea, setFrontalArea] = useState(
    initial?.frontal_area_m2 != null ? String(initial.frontal_area_m2) : '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const shapeOptions = useMemo(() => shapesForKind(kind), [kind]);
  const selectedPreset = shapePreset(kind, bodyShape || null);

  // Picking a shape sets its Cd and prefills the typical frontal area (still
  // editable). 'Use default' clears both so the kind-average CdA applies.
  function onShapeChange(next: BodyShape | '') {
    setBodyShape(next);
    const preset = shapePreset(kind, next || null);
    setFrontalArea(preset ? String(preset.frontal_area_m2) : '');
  }

  // Shapes differ by kind; a stale shape would be invalid after switching.
  function onKindChange(next: VehicleKind) {
    setKind(next);
    setBodyShape('');
    setFrontalArea('');
  }

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
    const preset = shapePreset(kind, bodyShape || null);
    const areaNum = parseFloat(frontalArea);
    const frontalAreaM2 = preset
      ? (isFinite(areaNum) && areaNum > 0 ? areaNum : preset.frontal_area_m2)
      : null;
    onSubmit({
      name: name.trim(),
      kind,
      mass_kg: massKg,
      drivetrain,
      frontal_area_m2: frontalAreaM2,
      drag_coefficient: preset ? preset.cd : null,
      body_shape: bodyShape || null,
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
    <form onSubmit={submit} className="space-y-3">
      <PlateField id="vf-name" label="Name">
        <input
          id="vf-name"
          required
          maxLength={120}
          className="field"
          value={name}
          placeholder="e.g. Golf R"
          onChange={(e) => setName(e.target.value)}
        />
      </PlateField>

      <PlateField id="vf-kind" label="Kind">
        <select
          id="vf-kind"
          className="field"
          value={kind}
          onChange={(e) => onKindChange(e.target.value as VehicleKind)}
        >
          <option value="car">Car</option>
          <option value="motorcycle">Motorcycle</option>
        </select>
      </PlateField>

      <PlateField id="vf-mass" label="Mass (kg)">
        <input
          id="vf-mass"
          type="number"
          min="1"
          step="0.1"
          required
          className="field"
          value={mass}
          inputMode="decimal"
          placeholder="Total: vehicle + driver + fuel"
          onChange={(e) => setMass(e.target.value)}
        />
      </PlateField>

      <PlateField id="vf-drivetrain" label="Drivetrain">
        <select
          id="vf-drivetrain"
          className="field"
          value={drivetrain}
          onChange={(e) => setDrivetrain(e.target.value as Drivetrain)}
        >
          <option value="fwd">FWD</option>
          <option value="rwd">RWD</option>
          <option value="awd">AWD</option>
          <option value="chain">Chain (motorcycle)</option>
          <option value="shaft">Shaft (motorcycle)</option>
        </select>
      </PlateField>

      <PlateField
        id="vf-shape"
        label="Body shape (drag)"
        hint={
          selectedPreset
            ? `Drag coefficient Cd is about ${selectedPreset.cd.toFixed(2)} for this shape. Frontal area is prefilled: adjust if you know yours.`
            : `Used for aerodynamic drag. Leave on default to use the average ${kind} value.`
        }
      >
        <select
          id="vf-shape"
          className="field"
          value={bodyShape}
          onChange={(e) => onShapeChange(e.target.value as BodyShape | '')}
        >
          <option value="">Use default (kind average)</option>
          {shapeOptions.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </PlateField>

      {selectedPreset && (
        <PlateField id="vf-area" label="Frontal area">
          <UnitField unit="m²">
            <input
              id="vf-area"
              className="field"
              value={frontalArea}
              inputMode="decimal"
              placeholder={String(selectedPreset.frontal_area_m2)}
              onChange={(e) => setFrontalArea(e.target.value)}
            />
          </UnitField>
        </PlateField>
      )}

      <PlateField id="vf-notes" label="Notes">
        <textarea
          id="vf-notes"
          className="field resize-none"
          rows={3}
          value={notes}
          placeholder="Optional: mods, baseline, etc."
          onChange={(e) => setNotes(e.target.value)}
        />
      </PlateField>

      <div className="rule-section pt-2.5">
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="vf-details-panel"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex w-full items-center justify-between py-1 text-left"
        >
          <span className="t-label">Details (optional)</span>
          <DisclosureIcon open={detailsOpen} />
        </button>

        {detailsOpen && (
          <div id="vf-details-panel" className="space-y-3 pt-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <PlateField id="vf-make" label="Make">
                <input
                  id="vf-make"
                  className="field"
                  value={make}
                  placeholder="VW"
                  onChange={(e) => setMake(e.target.value)}
                />
              </PlateField>
              <PlateField id="vf-model" label="Model">
                <input
                  id="vf-model"
                  className="field"
                  value={model}
                  placeholder="Golf R"
                  onChange={(e) => setModel(e.target.value)}
                />
              </PlateField>
              <PlateField
                id="vf-year"
                label="Year"
                error={yearError ? `Year must be ${MIN_YEAR}-${MAX_YEAR}.` : undefined}
              >
                <input
                  id="vf-year"
                  className="field"
                  style={yearError ? { borderBottomColor: 'var(--color-caution)' } : undefined}
                  value={year}
                  inputMode="numeric"
                  placeholder="2020"
                  onChange={(e) => setYear(e.target.value)}
                  aria-invalid={yearError}
                />
              </PlateField>
            </div>

            <PlateField id="vf-tire" label="Tires">
              <input
                id="vf-tire"
                className="field"
                value={tireLabel}
                placeholder="e.g. Michelin Pilot Sport 4S 235/40R18"
                onChange={(e) => setTireLabel(e.target.value)}
              />
            </PlateField>

            <PlateField id="vf-transmission" label="Transmission">
              <select
                id="vf-transmission"
                className="field"
                value={transmission}
                onChange={(e) => setTransmission(e.target.value as Transmission | '')}
              >
                <option value="">n/a</option>
                {TRANSMISSIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </PlateField>

            <PlateField id="vf-factory-hp" label="Factory power">
              <UnitField unit="hp">
                <input
                  id="vf-factory-hp"
                  className="field"
                  value={powerHpFactory}
                  inputMode="numeric"
                  placeholder="e.g. 300"
                  onChange={(e) => setPowerHpFactory(e.target.value)}
                />
              </UnitField>
            </PlateField>
          </div>
        )}
      </div>

      <div className="flex gap-2.5 pt-1">
        <PlateButton type="submit" variant="procedure" className="flex-1">
          Save vehicle
        </PlateButton>
        <PlateButton onClick={onCancel} className="flex-1">
          Cancel
        </PlateButton>
      </div>
    </form>
  );
}
