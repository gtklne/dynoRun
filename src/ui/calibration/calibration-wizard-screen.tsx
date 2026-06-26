import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { CalibrationStepGear, type GearInput } from './calibration-step-gear';
import { CalibrationStepMeasure } from './calibration-step-measure';
import { CalibrationStepConfirm } from './calibration-step-confirm';
import type { Calibration } from '@/shared/types';

type WizardStep = 'gear' | 'measure' | 'confirm';

const STEPS: WizardStep[] = ['gear', 'measure', 'confirm'];

export function CalibrationWizardScreen() {
  const { vehicleId = '' } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('gear');
  const [gear, setGear] = useState<GearInput | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);

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

      {step === 'gear' && (
        <CalibrationStepGear onSubmit={(g) => { setGear(g); setStep('measure'); }} />
      )}
      {step === 'measure' && gear && (
        <CalibrationStepMeasure
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
