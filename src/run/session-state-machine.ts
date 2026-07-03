import type { SessionState, SessionPull } from './types';
import type { UUID } from '@/shared/types';

export type SessionEvent =
  | { type: 'READY'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { type: 'START' }
  | { type: 'FINISH' }
  | { type: 'PULLS_READY'; pulls: SessionPull[] }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_DONE'; run_ids: UUID[] }
  | { type: 'SAVE_FAILED' }
  | { type: 'RESET' };

export const initialSessionState = (): SessionState => ({ kind: 'idle' });

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  if (event.type === 'RESET') return { kind: 'idle' };

  switch (state.kind) {
    case 'idle':
      if (event.type === 'READY') {
        return {
          kind: 'ready',
          vehicle_id: event.vehicle_id,
          calibration_id: event.calibration_id,
          gear_label: event.gear_label,
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
      if (event.type === 'PULLS_READY') return { ...state, kind: 'reviewing', pulls: event.pulls };
      return state;
    case 'reviewing':
      if (event.type === 'SAVE_START') return { ...state, kind: 'saving' };
      return state;
    case 'saving':
      if (event.type === 'SAVE_DONE') {
        return { kind: 'saved', vehicle_id: state.vehicle_id, run_ids: event.run_ids };
      }
      if (event.type === 'SAVE_FAILED') return { ...state, kind: 'reviewing' };
      return state;
    case 'saved':
      return state;
  }
}
