import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { CalibrationStepGear, type GearInput } from './calibration-step-gear';
import { CalibrationStepMeasure } from './calibration-step-measure';
import { CalibrationStepConfirm } from './calibration-step-confirm';
import type { Calibration } from '@/shared/types';

type WizardStep = 'gear' | 'measure' | 'confirm';

export function CalibrationWizardScreen() {
  const { vehicleId = '' } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStep>('gear');
  const [gear, setGear] = useState<GearInput | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);

  return (
    <section>
      <h1>New Calibration</h1>
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
    </section>
  );
}
