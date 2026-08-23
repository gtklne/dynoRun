import { describe, it, expect } from 'vitest';
import {
  calibrationSessionReducer,
  initialCalibrationSessionState,
  type CalibrationSessionEvent,
} from '@/run/calibration-session-state-machine';
import type { CalibrationCandidate, CalibrationSessionState } from '@/run/types';

const ready: CalibrationSessionEvent = {
  type: 'READY', vehicle_id: 'v1', gear_label: '4th', user_rpm: 4000,
};

function drive(events: CalibrationSessionEvent[]): CalibrationSessionState {
  return events.reduce(calibrationSessionReducer, initialCalibrationSessionState());
}

const someCandidate = {
  plateau: {} as CalibrationCandidate['plateau'],
  samples: [],
  rollout_m_per_rev: 0.375,
  plausible: true,
} as CalibrationCandidate;

const recorded: CalibrationSessionEvent[] = [ready, { type: 'START' }, { type: 'FINISH' }];
const reviewed: CalibrationSessionEvent[] = [
  ...recorded, { type: 'CANDIDATES_READY', candidates: [someCandidate] },
];

describe('calibrationSessionReducer', () => {
  it('walks the happy path idle -> ready -> recording -> detecting -> reviewing -> saving -> saved', () => {
    let s = drive([ready]);
    expect(s).toEqual({ kind: 'ready', vehicle_id: 'v1', gear_label: '4th', user_rpm: 4000 });
    s = calibrationSessionReducer(s, { type: 'START' });
    expect(s.kind).toBe('recording');
    s = calibrationSessionReducer(s, { type: 'FINISH' });
    expect(s.kind).toBe('detecting');
    s = calibrationSessionReducer(s, { type: 'CANDIDATES_READY', candidates: [someCandidate] });
    expect(s.kind).toBe('reviewing');
    if (s.kind !== 'reviewing') throw new Error('unreachable');
    // The gear context the rider entered at READY rides along the whole way:
    // it is what the saved calibration's rpm comes from.
    expect(s.candidates).toEqual([someCandidate]);
    expect(s.gear_label).toBe('4th');
    expect(s.user_rpm).toBe(4000);
    s = calibrationSessionReducer(s, { type: 'SAVE_START' });
    expect(s.kind).toBe('saving');
    s = calibrationSessionReducer(s, { type: 'SAVE_DONE', calibration_id: 'cal-1' });
    expect(s).toEqual({ kind: 'saved', vehicle_id: 'v1', calibration_id: 'cal-1' });
  });

  it('returns to reviewing with the candidates intact when saving fails', () => {
    let s = drive([...reviewed, { type: 'SAVE_START' }]);
    s = calibrationSessionReducer(s, { type: 'SAVE_FAILED' });
    expect(s.kind).toBe('reviewing');
    if (s.kind !== 'reviewing') throw new Error('unreachable');
    expect(s.candidates).toEqual([someCandidate]);
    expect(s.user_rpm).toBe(4000);
  });

  it('ignores out-of-order events instead of throwing', () => {
    expect(drive([{ type: 'START' }]).kind).toBe('idle');
    expect(drive([{ type: 'FINISH' }]).kind).toBe('idle');
    expect(drive([ready, { type: 'FINISH' }]).kind).toBe('ready');
    expect(drive([ready, ready]).kind).toBe('ready');
    expect(drive([ready, { type: 'START' }, { type: 'SAVE_START' }]).kind).toBe('recording');
    expect(drive([ready, { type: 'START' }, { type: 'CANDIDATES_READY', candidates: [] }]).kind)
      .toBe('recording');
    expect(drive([...recorded, { type: 'SAVE_START' }]).kind).toBe('detecting');
    expect(drive([...reviewed, { type: 'SAVE_DONE', calibration_id: 'cal-1' }]).kind)
      .toBe('reviewing');
  });

  it('RESET returns to idle from anywhere', () => {
    for (const prefix of [[], [ready], recorded, reviewed, [...reviewed, { type: 'SAVE_START' } as CalibrationSessionEvent]]) {
      expect(drive([...prefix, { type: 'RESET' }])).toEqual({ kind: 'idle' });
    }
    const saved = drive([...reviewed, { type: 'SAVE_START' }, { type: 'SAVE_DONE', calibration_id: 'cal-1' }]);
    expect(calibrationSessionReducer(saved, { type: 'RESET' })).toEqual({ kind: 'idle' });
  });

  it('saved is terminal for everything but RESET', () => {
    const saved = drive([...reviewed, { type: 'SAVE_START' }, { type: 'SAVE_DONE', calibration_id: 'cal-1' }]);
    const events: CalibrationSessionEvent[] = [
      ready,
      { type: 'START' },
      { type: 'FINISH' },
      { type: 'CANDIDATES_READY', candidates: [someCandidate] },
      { type: 'SAVE_START' },
      { type: 'SAVE_DONE', calibration_id: 'cal-2' },
      { type: 'SAVE_FAILED' },
    ];
    for (const event of events) {
      expect(calibrationSessionReducer(saved, event)).toBe(saved);
    }
  });
});
