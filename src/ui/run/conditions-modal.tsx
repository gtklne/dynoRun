import { useEffect, useMemo, useState } from 'react';
import type { RunConditions } from '@/shared/types';

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

  useEffect(() => {
    if (open) {
      setForm(fromInitial(initial));
      setError(null);
      setSaving(false);
    }
  }, [open, initial]);

  const dirty = useMemo(() => isDirty(form, initial), [form, initial]);

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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conditions-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-md w-full mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="conditions-modal-title" className="text-lg font-semibold text-zinc-100">
            Conditions
          </h2>
          <button
            type="button"
            aria-label="Close conditions"
            onClick={attemptClose}
            className="-mr-2 -mt-2 rounded p-1 text-zinc-500 hover:text-zinc-200"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cond-temp" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Ambient temperature (°C)
          </label>
          <input
            id="cond-temp"
            type="number"
            inputMode="decimal"
            step={1}
            value={form.ambient_temp_c}
            placeholder="e.g. 18"
            onChange={(e) => update('ambient_temp_c', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cond-wind" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Wind (km/h)
          </label>
          <input
            id="cond-wind"
            type="number"
            inputMode="decimal"
            step={1}
            value={form.wind_kmh}
            placeholder="e.g. 5"
            onChange={(e) => update('wind_kmh', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
          />
          <p className="text-[11px] text-zinc-500">+ tailwind, − headwind</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cond-slope" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Road slope (%)
          </label>
          <input
            id="cond-slope"
            type="number"
            inputMode="decimal"
            step={0.1}
            value={form.road_slope_pct}
            placeholder="e.g. 0.5"
            onChange={(e) => update('road_slope_pct', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cond-surface" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Surface
          </label>
          <select
            id="cond-surface"
            value={form.surface}
            onChange={(e) => update('surface', e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors text-sm"
          >
            {SURFACE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={attemptClose}
            disabled={saving}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-3 rounded-xl transition-colors border border-zinc-700 disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
