import type { Calibration } from '@/shared/types';

export function CalibrationStepConfirm({ calibration, onDone }: { calibration: Calibration; onDone: () => void }) {
  return (
    <section>
      <h2>Step 3 — Done</h2>
      <p>Saved calibration for gear <strong>{calibration.gear_label}</strong>:</p>
      <ul>
        <li>{calibration.rpm} RPM @ {calibration.speed_kmh.toFixed(1)} km/h</li>
        <li>Rollout: {calibration.rollout_m_per_rev.toFixed(4)} m/rev</li>
      </ul>
      <button onClick={onDone}>Done</button>
    </section>
  );
}
