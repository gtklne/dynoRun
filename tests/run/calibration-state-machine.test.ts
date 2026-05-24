import { describe, it, expect } from 'vitest';
import { calibrationReducer, initialCalibrationState } from '@/run/calibration-state-machine';

describe('calibrationReducer', () => {
  it('starts measuring on START', () => {
    const s = calibrationReducer(initialCalibrationState(), {
      type: 'START',
      gear_label: '3rd',
      user_rpm: 3000,
      now_ms: 100,
    });
    expect(s).toEqual({ kind: 'measuring', gear_label: '3rd', user_rpm: 3000, started_at_ms: 100 });
  });

  it('transitions to stable when STABILITY_DETECTED fires during measuring', () => {
    const s = calibrationReducer(
      { kind: 'measuring', gear_label: '3rd', user_rpm: 3000, started_at_ms: 0 },
      { type: 'STABILITY_DETECTED', captured_speed_kmh: 80.2 },
    );
    expect(s).toEqual({ kind: 'stable', gear_label: '3rd', user_rpm: 3000, captured_speed_kmh: 80.2 });
  });

  it('CONFIRM only valid in stable state', () => {
    const stable = { kind: 'stable' as const, gear_label: '3rd', user_rpm: 3000, captured_speed_kmh: 80.2 };
    const s = calibrationReducer(stable, { type: 'CONFIRM', calibration_id: 'cal-1' });
    expect(s).toEqual({ kind: 'confirmed', calibration_id: 'cal-1' });
  });

  it('CONFIRM from idle is a no-op', () => {
    const s = calibrationReducer(initialCalibrationState(), { type: 'CONFIRM', calibration_id: 'cal-1' });
    expect(s).toEqual({ kind: 'idle' });
  });

  it('RESTART returns to idle from any state', () => {
    const s = calibrationReducer(
      { kind: 'measuring', gear_label: '3rd', user_rpm: 3000, started_at_ms: 0 },
      { type: 'RESTART' },
    );
    expect(s).toEqual({ kind: 'idle' });
  });
});
