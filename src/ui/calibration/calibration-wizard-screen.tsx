import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { Plate, TitleBlock, Zone } from '@/ui/plate';
import { CalibrationStepGear, type GearInput, type MeasureMode } from './calibration-step-gear';
import { CalibrationStepMeasure } from './calibration-step-measure';
import { CalibrationStepMeasureHandsFree } from './calibration-step-measure-handsfree';
import { CalibrationStepConfirm } from './calibration-step-confirm';
import type { Calibration, VehicleKind } from '@/shared/types';

type WizardStep = 'gear' | 'measure' | 'confirm';

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'gear', label: 'Gear and target' },
  { key: 'measure', label: 'Measure' },
  { key: 'confirm', label: 'Confirm' },
];

// A rider cannot watch the screen or tap a confirm button mid-pull, so a
// motorcycle starts on the hands-free capture. Still switchable either way: a
// bike on a rolling road, or a car whose driver would rather not watch either.
function defaultMeasureMode(kind: VehicleKind | null): MeasureMode {
  return kind === 'motorcycle' ? 'hands_free' : 'tap';
}

function DoneMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

export function CalibrationWizardScreen() {
  const { vehicleId = '' } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('gear');
  const [gear, setGear] = useState<GearInput | null>(null);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('tap');
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [kind, setKind] = useState<VehicleKind | null>(null);
  const [vehicleName, setVehicleName] = useState<string | null>(null);
  const [kindLoaded, setKindLoaded] = useState(false);

  // The gear step seeds its mode toggle from this, and useState only reads an
  // initial value once, so the step must not mount before the fetch settles.
  useEffect(() => {
    let cancelled = false;
    vehicleRepository.get(vehicleId)
      .then((v) => {
        if (cancelled) return;
        setKind(v?.kind ?? null);
        setVehicleName(v?.name ?? null);
      })
      .catch(() => { /* fall back to the tap default */ })
      .finally(() => { if (!cancelled) setKindLoaded(true); });
    return () => { cancelled = true; };
  }, [vehicleId]);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <Plate className="lg:mx-auto lg:max-w-3xl">
      <TitleBlock
        ident={vehicleName ?? undefined}
        title="New calibration"
        meta={[
          { label: 'Procedure', value: 'Capture rollout from a steady hold' },
          { label: 'Yields', value: 'rollout, m/rev' },
        ]}
      />

      <Zone label="Steps" note={`Step ${stepIndex + 1} of ${STEPS.length}`}>
        <ol className="flex">
          {STEPS.map((s, i) => {
            const current = i === stepIndex;
            const done = i < stepIndex;
            return (
              <li
                key={s.key}
                aria-current={current ? 'step' : undefined}
                className={`min-w-0 flex-1 px-3 py-2 ${i > 0 ? 'rule-l' : ''} ${done ? 'plate-sunk' : ''}`}
                style={
                  current
                    ? { background: 'var(--color-ink)', color: 'var(--color-sheet)' }
                    : undefined
                }
              >
                <p className="t-annotation flex items-center gap-1.5" style={current ? { color: 'inherit' } : undefined}>
                  {done && <DoneMark />}
                  {i + 1}
                </p>
                <p className="t-label mt-1 truncate" style={current ? { color: 'inherit' } : undefined}>
                  {s.label}
                </p>
              </li>
            );
          })}
        </ol>
      </Zone>

      {step === 'gear' && !kindLoaded && (
        <p className="t-annotation">Loading vehicle...</p>
      )}
      {step === 'gear' && kindLoaded && (
        <CalibrationStepGear
          defaultMeasureMode={defaultMeasureMode(kind)}
          onSubmit={(g, mode) => { setGear(g); setMeasureMode(mode); setStep('measure'); }}
        />
      )}
      {step === 'measure' && gear && measureMode === 'tap' && (
        <CalibrationStepMeasure
          vehicleId={vehicleId}
          gear={gear}
          onConfirmed={(cal) => { setCalibration(cal); setStep('confirm'); }}
          onCancel={() => navigate(-1)}
        />
      )}
      {step === 'measure' && gear && measureMode === 'hands_free' && (
        <CalibrationStepMeasureHandsFree
          vehicleId={vehicleId}
          gear={gear}
          onConfirmed={(cal) => { setCalibration(cal); setStep('confirm'); }}
          onCancel={() => navigate(-1)}
        />
      )}
      {step === 'confirm' && calibration && (
        <CalibrationStepConfirm
          calibration={calibration}
          onDone={() => navigate(`/vehicles/${vehicleId}`)}
        />
      )}
    </Plate>
  );
}
