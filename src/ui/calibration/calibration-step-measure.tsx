import { useEffect, useRef, useState } from 'react';
import { useDatabase } from '@/storage/db-context';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { CalibrationController } from '@/run/calibration-controller';
import { useSpeedSourceFactory } from './speed-source-context';
import type { GearInput } from './calibration-step-gear';
import type { Calibration } from '@/shared/types';
import type { CalibrationState } from '@/run/types';

interface Props {
  vehicleId: string;
  gear: GearInput;
  onConfirmed: (cal: Calibration) => void;
  onCancel: () => void;
}

export function CalibrationStepMeasure({ vehicleId, gear, onConfirmed, onCancel }: Props) {
  const db = useDatabase();
  const speedSourceFactory = useSpeedSourceFactory();
  const [state, setState] = useState<CalibrationState>({ kind: 'idle' });
  const ctrlRef = useRef<CalibrationController | null>(null);

  useEffect(() => {
    return () => {
      ctrlRef.current?.stop().catch(() => {});
      ctrlRef.current = null;
    };
  }, []);

  async function start() {
    const sensor = speedSourceFactory();
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: new CalibrationRepository(db),
      onStateChange: setState,
    });
    ctrlRef.current = ctrl;
    await ctrl.start({ gear_label: gear.gear_label, user_rpm: gear.user_rpm });
  }

  async function confirm() {
    if (!ctrlRef.current) return;
    const cal = await ctrlRef.current.confirm();
    await ctrlRef.current.stop();
    onConfirmed(cal);
  }

  return (
    <section>
      <h2>Step 2 — Hold steady at {gear.user_rpm} RPM in {gear.gear_label}</h2>
      <p>Drive at a constant {gear.user_rpm} RPM. The app will capture your speed when it stabilizes.</p>
      {state.kind === 'idle' && (
        <button onClick={start}>Start measurement</button>
      )}
      {state.kind === 'measuring' && (
        <p>Measuring… hold the RPM steady.</p>
      )}
      {state.kind === 'stable' && (
        <div>
          <p>Captured speed: <strong>{state.captured_speed_kmh.toFixed(1)} km/h</strong></p>
          <button onClick={confirm}>Save calibration</button>
        </div>
      )}
      <button type="button" onClick={onCancel}>Cancel</button>
    </section>
  );
}
