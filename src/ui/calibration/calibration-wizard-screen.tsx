import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { CalibrationStepGear, type GearInput, type MeasureMode } from './calibration-step-gear';
import { CalibrationStepMeasure } from './calibration-step-measure';
import { CalibrationStepMeasureHandsFree } from './calibration-step-measure-handsfree';
import { CalibrationStepConfirm } from './calibration-step-confirm';
import type { Calibration, VehicleKind } from '@/shared/types';

type WizardStep = 'gear' | 'measure' | 'confirm';

const STEPS: WizardStep[] = ['gear', 'measure', 'confirm'];

// A rider cannot watch the screen or tap a confirm button mid-pull, so a
// motorcycle starts on the hands-free capture. Still switchable either way: a
// bike on a rolling road, or a car whose driver would rather not watch either.
function defaultMeasureMode(kind: VehicleKind | null): MeasureMode {
  return kind === 'motorcycle' ? 'hands_free' : 'tap';
}

export function CalibrationWizardScreen() {
  const { vehicleId = '' } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('gear');
  const [gear, setGear] = useState<GearInput | null>(null);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('tap');
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [kind, setKind] = useState<VehicleKind | null>(null);
  const [kindLoaded, setKindLoaded] = useState(false);

  // The gear step seeds its mode toggle from this, and useState only reads an
  // initial value once, so the step must not mount before the fetch settles.
  useEffect(() => {
    let cancelled = false;
    vehicleRepository.get(vehicleId)
      .then((v) => { if (!cancelled) setKind(v?.kind ?? null); })
      .catch(() => { /* fall back to the tap default */ })
      .finally(() => { if (!cancelled) setKindLoaded(true); });
    return () => { cancelled = true; };
  }, [vehicleId]);

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="space-y-5 lg:max-w-3xl lg:mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">New Calibration</h1>
        <p className="text-zinc-500 text-sm mt-1">Sets up your gear ratio for dyno runs</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
              i < stepIndex
                ? 'bg-emerald-500 text-zinc-950'
                : i === stepIndex
                  ? 'bg-amber-500 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-500'
            }`}>
              {i < stepIndex ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : (
                i + 1
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-8 rounded-full transition-colors ${i < stepIndex ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
            )}
          </div>
        ))}
        <span className="text-zinc-500 text-xs ml-1">Step {stepIndex + 1} of {STEPS.length}</span>
      </div>

      {step === 'gear' && !kindLoaded && (
        <p className="text-zinc-500 text-sm">Loading vehicle…</p>
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
    </div>
  );
}
