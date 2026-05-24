import { describe, it, expect } from 'vitest';
import { runReducer, initialRunState } from '@/run/run-state-machine';

describe('runReducer', () => {
  it('starts in idle', () => {
    expect(initialRunState()).toEqual({ kind: 'idle' });
  });

  it('READY transitions idle -> ready', () => {
    const s = runReducer(initialRunState(), {
      type: 'READY',
      vehicle_id: 'v1',
      calibration_id: 'c1',
      gear_label: '3rd',
    });
    expect(s).toEqual({ kind: 'ready', vehicle_id: 'v1', calibration_id: 'c1', gear_label: '3rd' });
  });

  it('START transitions ready -> running', () => {
    const s = runReducer(
      { kind: 'ready', vehicle_id: 'v1', calibration_id: 'c1', gear_label: '3rd' },
      { type: 'START', run_id: 'r1', now_ms: 1000 },
    );
    expect(s).toEqual({ kind: 'running', run_id: 'r1', started_t_ms: 1000 });
  });

  it('STOP transitions running -> analyzing', () => {
    const s = runReducer(
      { kind: 'running', run_id: 'r1', started_t_ms: 0 },
      { type: 'STOP' },
    );
    expect(s).toEqual({ kind: 'analyzing', run_id: 'r1' });
  });

  it('ANALYSIS_DONE transitions analyzing -> reviewing', () => {
    const s = runReducer({ kind: 'analyzing', run_id: 'r1' }, { type: 'ANALYSIS_DONE' });
    expect(s).toEqual({ kind: 'reviewing', run_id: 'r1' });
  });

  it('SAVE transitions reviewing -> saved', () => {
    const s = runReducer({ kind: 'reviewing', run_id: 'r1' }, { type: 'SAVE' });
    expect(s).toEqual({ kind: 'saved', run_id: 'r1' });
  });

  it('DISCARD from reviewing -> aborted', () => {
    const s = runReducer({ kind: 'reviewing', run_id: 'r1' }, { type: 'DISCARD' });
    expect(s).toEqual({ kind: 'aborted', run_id: 'r1' });
  });

  it('ABORT from running -> aborted', () => {
    const s = runReducer({ kind: 'running', run_id: 'r1', started_t_ms: 0 }, { type: 'ABORT' });
    expect(s).toEqual({ kind: 'aborted', run_id: 'r1' });
  });

  it('events out of order are no-ops', () => {
    const s = runReducer(initialRunState(), { type: 'STOP' });
    expect(s).toEqual({ kind: 'idle' });
  });
});
