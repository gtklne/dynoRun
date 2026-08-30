import { useState } from 'react';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { NotesBox, PlateButton, PlateField, Zone } from '@/ui/plate';

export interface GearInput {
  gear_label: string;
  user_rpm: number;
}

/**
 * How the speed gets captured. 'tap' is the original wizard: watch the screen
 * and confirm when it locks on. 'hands_free' records the whole ride and asks
 * afterwards, which is the only one that works from a bike.
 */
export type MeasureMode = 'tap' | 'hands_free';

const MODE_OPTIONS: ReadonlyArray<{ value: MeasureMode; label: string }> = [
  { value: 'hands_free', label: 'Hands-free' },
  { value: 'tap', label: 'On screen' },
];

const GEAR_PRESETS = ['2nd', '3rd', '4th', '5th', '6th'] as const;

const RPM_STEPS = [-250, -100, 100, 250] as const;

type GearMode = 'preset' | 'custom';

interface Props {
  onSubmit: (g: GearInput, measureMode: MeasureMode) => void;
  defaultMeasureMode?: MeasureMode;
}

function NextMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <line x1="4" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}

function stepLabel(delta: number): string {
  // U+2212 is the maths minus, not a dash: these are signed operators.
  return delta < 0 ? `−${Math.abs(delta)}` : `+${delta}`;
}

export function CalibrationStepGear({ onSubmit, defaultMeasureMode = 'tap' }: Props) {
  const [mode, setMode] = useState<GearMode>('preset');
  const [gearLabel, setGearLabel] = useState('3rd');
  const [rpm, setRpm] = useState('3000');
  const [measureMode, setMeasureMode] = useState<MeasureMode>(defaultMeasureMode);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = parseFloat(rpm);
    if (!gearLabel.trim() || !isFinite(r) || r <= 0) return;
    onSubmit({ gear_label: gearLabel.trim(), user_rpm: r }, measureMode);
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
    <form onSubmit={submit} className="plate-stack">
      <NotesBox title="What this step sets">
        Choose the gear you will use for the run. You will hold a steady RPM in this gear, and the
        measured speed at that RPM is what fixes the speed-to-RPM ratio (rollout) for every later
        run in this gear.
      </NotesBox>

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        <Zone label="Gear">
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {GEAR_PRESETS.map((preset) => (
                <PlateButton
                  key={preset}
                  onClick={() => selectPreset(preset)}
                  aria-pressed={mode === 'preset' && gearLabel === preset}
                >
                  {preset}
                </PlateButton>
              ))}
              <PlateButton onClick={selectCustom} aria-pressed={mode === 'custom'}>
                Custom
              </PlateButton>
            </div>
            {mode === 'custom' && (
              <PlateField label="Custom gear label" id="cal-gear">
                <input
                  id="cal-gear"
                  required
                  maxLength={80}
                  className="field"
                  value={gearLabel}
                  placeholder="e.g. 1st, Top"
                  onChange={(e) => setGearLabel(e.target.value)}
                />
              </PlateField>
            )}
          </div>
        </Zone>

        <Zone label="Hold target">
          <div className="space-y-2.5">
            <PlateField
              label="Target RPM"
              id="cal-rpm"
              hint="You will hold this RPM steady during calibration."
            >
              <input
                id="cal-rpm"
                type="number"
                min="1"
                step="1"
                required
                className="field"
                value={rpm}
                inputMode="decimal"
                placeholder="e.g. 3000"
                onChange={(e) => setRpm(e.target.value)}
              />
            </PlateField>
            <div className="flex items-stretch gap-1.5">
              {RPM_STEPS.map((delta) => (
                <PlateButton key={delta} onClick={() => bump(delta)} className="flex-1">
                  {stepLabel(delta)}
                </PlateButton>
              ))}
            </div>
          </div>
        </Zone>
      </div>

      <Zone label="How to capture it">
        <div className="space-y-2">
          <SegmentedControl
            options={MODE_OPTIONS}
            value={measureMode}
            onChange={setMeasureMode}
            ariaLabel="How to capture the calibration"
          />
          <p className="t-body text-[0.8125rem] leading-6">
            {measureMode === 'hands_free'
              ? 'Records the whole ride and asks afterwards which steady hold to keep. Nothing to tap while moving, so this is the one for a motorcycle.'
              : 'Watch the screen and confirm when it locks on. Fine in a car, not on a bike.'}
          </p>
        </div>
      </Zone>

      <div className="flex justify-end">
        <PlateButton type="submit" variant="procedure" className="w-full lg:w-auto lg:px-10">
          Next
          <NextMark />
        </PlateButton>
      </div>
    </form>
  );
}
