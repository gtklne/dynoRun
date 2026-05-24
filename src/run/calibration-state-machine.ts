import type { CalibrationState } from './types';
import type { UUID } from '@/shared/types';

export type CalibrationEvent =
  | { type: 'START'; gear_label: string; user_rpm: number; now_ms: number }
  | { type: 'STABILITY_DETECTED'; captured_speed_kmh: number }
  | { type: 'CONFIRM'; calibration_id: UUID }
  | { type: 'RESTART' };

export const initialCalibrationState = (): CalibrationState => ({ kind: 'idle' });

export function calibrationReducer(state: CalibrationState, event: CalibrationEvent): CalibrationState {
  if (event.type === 'RESTART') return { kind: 'idle' };

  switch (state.kind) {
    case 'idle':
      if (event.type === 'START') {
        return {
          kind: 'measuring',
          gear_label: event.gear_label,
          user_rpm: event.user_rpm,
          started_at_ms: event.now_ms,
        };
      }
      return state;
    case 'measuring':
      if (event.type === 'STABILITY_DETECTED') {
        return {
          kind: 'stable',
          gear_label: state.gear_label,
          user_rpm: state.user_rpm,
          captured_speed_kmh: event.captured_speed_kmh,
        };
      }
      return state;
    case 'stable':
      if (event.type === 'CONFIRM') {
        return { kind: 'confirmed', calibration_id: event.calibration_id };
      }
      return state;
    case 'confirmed':
      return state;
  }
}
