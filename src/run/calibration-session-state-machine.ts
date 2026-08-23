import type { CalibrationSessionState, CalibrationCandidate } from './types';
import type { UUID } from '@/shared/types';

export type CalibrationSessionEvent =
  | { type: 'READY'; vehicle_id: UUID; gear_label: string; user_rpm: number }
  | { type: 'START' }
  | { type: 'FINISH' }
  | { type: 'CANDIDATES_READY'; candidates: CalibrationCandidate[] }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_DONE'; calibration_id: UUID }
  | { type: 'SAVE_FAILED' }
  | { type: 'RESET' };

export const initialCalibrationSessionState = (): CalibrationSessionState => ({ kind: 'idle' });

export function calibrationSessionReducer(
  state: CalibrationSessionState,
  event: CalibrationSessionEvent,
): CalibrationSessionState {
  if (event.type === 'RESET') return { kind: 'idle' };

  switch (state.kind) {
    case 'idle':
      if (event.type === 'READY') {
        return {
          kind: 'ready',
          vehicle_id: event.vehicle_id,
          gear_label: event.gear_label,
          user_rpm: event.user_rpm,
        };
      }
      return state;
    case 'ready':
      if (event.type === 'START') return { ...state, kind: 'recording' };
      return state;
    case 'recording':
      if (event.type === 'FINISH') return { ...state, kind: 'detecting' };
      return state;
    case 'detecting':
      if (event.type === 'CANDIDATES_READY') {
        return { ...state, kind: 'reviewing', candidates: event.candidates };
      }
      return state;
    case 'reviewing':
      if (event.type === 'SAVE_START') return { ...state, kind: 'saving' };
      return state;
    case 'saving':
      if (event.type === 'SAVE_DONE') {
        return { kind: 'saved', vehicle_id: state.vehicle_id, calibration_id: event.calibration_id };
      }
      // Back to reviewing so the rider can retry or pick a different hold,
      // rather than losing a whole ride's worth of candidates to one 400.
      if (event.type === 'SAVE_FAILED') return { ...state, kind: 'reviewing' };
      return state;
    case 'saved':
      return state;
  }
}
