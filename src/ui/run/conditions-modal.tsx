import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunConditions } from '@/shared/types';
import { PlateButton, PlateField } from '@/ui/plate';

export interface ConditionsModalProps {
  open: boolean;
  initial: RunConditions;
  onClose: () => void;
  onSave: (next: RunConditions) => Promise<void> | void;
}

interface FormState {
  ambient_temp_c: string;
  wind_kmh: string;
  road_slope_pct: string;
  surface: string;
}

const SURFACE_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'asphalt', label: 'Asphalt' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'wet asphalt', label: 'Wet asphalt' },
  { value: 'damp', label: 'Damp' },
  { value: 'loose/gravel', label: 'Loose/gravel' },
  { value: 'other', label: 'Other' },
] as const;

function numberToInput(n: number | undefined): string {
  return n === undefined || Number.isNaN(n) ? '' : String(n);
}

function fromInitial(c: RunConditions): FormState {
  return {
    ambient_temp_c: numberToInput(c.ambient_temp_c),
    wind_kmh: numberToInput(c.wind_kmh),
    road_slope_pct: numberToInput(c.road_slope_pct),
    surface: c.surface ?? '',
  };
}

function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

function buildConditions(form: FormState): RunConditions {
  const next: RunConditions = {};
  const temp = parseNumber(form.ambient_temp_c);
  if (temp !== undefined) next.ambient_temp_c = temp;
  const wind = parseNumber(form.wind_kmh);
  if (wind !== undefined) next.wind_kmh = wind;
  const slope = parseNumber(form.road_slope_pct);
  if (slope !== undefined) next.road_slope_pct = slope;
  const surface = form.surface.trim();
  if (surface !== '') next.surface = surface;
  return next;
}

function isDirty(form: FormState, initial: RunConditions): boolean {
  const base = fromInitial(initial);
  return (
    form.ambient_temp_c !== base.ambient_temp_c ||
    form.wind_kmh !== base.wind_kmh ||
    form.road_slope_pct !== base.road_slope_pct ||
    form.surface !== base.surface
  );
}

export function ConditionsModal({ open, initial, onClose, onSave }: ConditionsModalProps) {
  const [form, setForm] = useState<FormState>(() => fromInitial(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (open) {
      setForm(fromInitial(initial));
      setError(null);
      setSaving(false);
    }
  }, [open, initial]);

  const dirty = useMemo(() => isDirty(form, initial), [form, initial]);
  // Mirror dirty into a ref so the escape-key handler doesn't have to be
  // re-registered on every keystroke.
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Lock body scroll while open so the page behind doesn't scroll on iOS.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes (with the dirty-confirm guard), matches HelpDrawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dirtyRef.current && !window.confirm('Discard unsaved condition changes?')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus the first input when the modal opens.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function attemptClose() {
    if (dirty && !window.confirm('Discard unsaved condition changes?')) return;
    onClose();
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = buildConditions(form);
      await onSave(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not save conditions');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conditions-modal-title"
      style={{ background: 'color-mix(in srgb, var(--color-ink) 55%, transparent)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      <div className="plane w-full max-w-md">
        <div className="block-head items-center">
          <h2 id="conditions-modal-title" className="t-plate-title">
            Conditions
          </h2>
          <PlateButton aria-label="Close conditions" onClick={attemptClose} className="px-2" style={{ minHeight: 36 }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="square"
              aria-hidden="true"
            >
              <line x1="19" y1="5" x2="5" y2="19" />
              <line x1="5" y1="5" x2="19" y2="19" />
            </svg>
          </PlateButton>
        </div>

        <div className="space-y-3 block-body">
          <PlateField id="cond-temp" label="Ambient temperature (°C)">
            <input
              ref={firstInputRef}
              id="cond-temp"
              type="number"
              inputMode="decimal"
              step={1}
              value={form.ambient_temp_c}
              placeholder="e.g. 18"
              onChange={(e) => update('ambient_temp_c', e.target.value)}
              className="field"
            />
          </PlateField>

          <PlateField id="cond-wind" label="Wind (km/h)" hint="+ tailwind, − headwind">
            <input
              id="cond-wind"
              type="number"
              inputMode="decimal"
              step={1}
              value={form.wind_kmh}
              placeholder="e.g. 5"
              onChange={(e) => update('wind_kmh', e.target.value)}
              className="field"
            />
          </PlateField>

          <PlateField id="cond-slope" label="Road slope (%)">
            <input
              id="cond-slope"
              type="number"
              inputMode="decimal"
              step={0.1}
              value={form.road_slope_pct}
              placeholder="e.g. 0.5"
              onChange={(e) => update('road_slope_pct', e.target.value)}
              className="field"
            />
          </PlateField>

          <PlateField id="cond-surface" label="Surface">
            <select
              id="cond-surface"
              value={form.surface}
              onChange={(e) => update('surface', e.target.value)}
              className="field"
            >
              {SURFACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </PlateField>

          {error && (
            <p role="alert" className="t-body text-sm" style={{ color: 'var(--color-caution)' }}>
              {error}
            </p>
          )}
        </div>

        <div className="rule-t flex gap-2.5 block-body">
          <PlateButton variant="procedure" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Saving...' : 'Save'}
          </PlateButton>
          <PlateButton onClick={attemptClose} disabled={saving} className="flex-1">
            Cancel
          </PlateButton>
        </div>
      </div>
    </div>
  );
}
