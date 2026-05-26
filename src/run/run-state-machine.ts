import type { RunState } from './types';
import type { UUID } from '@/shared/types';

export type RunEvent =
  | { type: 'READY'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { type: 'START'; run_id: UUID; now_ms: number }
  | { type: 'STOP' }
  | { type: 'ABORT' }
  | { type: 'ANALYSIS_DONE' }
  | { type: 'ANALYSIS_FAILED' }
  | { type: 'SAVE' }
  | { type: 'DISCARD' }
  | { type: 'RESET' };

export const initialRunState = (): RunState => ({ kind: 'idle' });

export function runReducer(state: RunState, event: RunEvent): RunState {
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
      if (event.type === 'START') {
        return { kind: 'running', run_id: event.run_id, started_t_ms: event.now_ms };
      }
      return state;
    case 'running':
      if (event.type === 'STOP') return { kind: 'analyzing', run_id: state.run_id };
      if (event.type === 'ABORT') return { kind: 'aborted', run_id: state.run_id };
      return state;
    case 'analyzing':
      if (event.type === 'ANALYSIS_DONE') return { kind: 'reviewing', run_id: state.run_id };
      if (event.type === 'ANALYSIS_FAILED') return { kind: 'aborted', run_id: state.run_id };
      return state;
    case 'reviewing':
      if (event.type === 'SAVE') return { kind: 'saved', run_id: state.run_id };
      if (event.type === 'DISCARD') return { kind: 'aborted', run_id: state.run_id };
      return state;
    case 'saved':
    case 'aborted':
      return state;
  }
}
