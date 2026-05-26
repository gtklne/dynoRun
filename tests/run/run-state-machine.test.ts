import { describe, it, expect } from 'vitest';
import { initialRunState, runReducer } from '@/run/run-state-machine';

const VEHICLE = 'v-1';
const CAL = 'c-1';
const RUN = 'r-1';

describe('runReducer', () => {
  it('walks the happy path idle -> ready -> running -> analyzing -> reviewing -> saved', () => {
    let s = initialRunState();
    s = runReducer(s, { type: 'READY', vehicle_id: VEHICLE, calibration_id: CAL, gear_label: '4' });
    expect(s.kind).toBe('ready');
    s = runReducer(s, { type: 'START', run_id: RUN, now_ms: 0 });
    expect(s.kind).toBe('running');
    s = runReducer(s, { type: 'STOP' });
    expect(s.kind).toBe('analyzing');
    s = runReducer(s, { type: 'ANALYSIS_DONE' });
    expect(s.kind).toBe('reviewing');
    s = runReducer(s, { type: 'SAVE' });
    expect(s.kind).toBe('saved');
  });

  it('transitions analyzing -> aborted on ANALYSIS_FAILED', () => {
    let s = initialRunState();
    s = runReducer(s, { type: 'READY', vehicle_id: VEHICLE, calibration_id: CAL, gear_label: '4' });
    s = runReducer(s, { type: 'START', run_id: RUN, now_ms: 0 });
    s = runReducer(s, { type: 'STOP' });
    expect(s.kind).toBe('analyzing');
    s = runReducer(s, { type: 'ANALYSIS_FAILED' });
    expect(s).toEqual({ kind: 'aborted', run_id: RUN });
  });

  it('ignores ANALYSIS_FAILED outside of analyzing', () => {
    let s = initialRunState();
    s = runReducer(s, { type: 'ANALYSIS_FAILED' });
    expect(s.kind).toBe('idle');
    s = runReducer(s, { type: 'READY', vehicle_id: VEHICLE, calibration_id: CAL, gear_label: '4' });
    s = runReducer(s, { type: 'ANALYSIS_FAILED' });
    expect(s.kind).toBe('ready');
  });

  it('RESET returns to idle from any state', () => {
    let s = runReducer(initialRunState(), { type: 'READY', vehicle_id: VEHICLE, calibration_id: CAL, gear_label: '4' });
    s = runReducer(s, { type: 'START', run_id: RUN, now_ms: 0 });
    s = runReducer(s, { type: 'STOP' });
    s = runReducer(s, { type: 'RESET' });
    expect(s).toEqual({ kind: 'idle' });
  });
});
