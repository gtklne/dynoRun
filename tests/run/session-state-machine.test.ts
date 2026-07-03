import { describe, it, expect } from 'vitest';
import { sessionReducer, initialSessionState, type SessionEvent } from '@/run/session-state-machine';
import type { SessionState, SessionPull } from '@/run/types';

const ready: SessionEvent = { type: 'READY', vehicle_id: 'v1', calibration_id: 'c1', gear_label: '4th' };

function drive(events: SessionEvent[]): SessionState {
  return events.reduce(sessionReducer, initialSessionState());
}

const somePull = { pull: {} as SessionPull['pull'], samples: [], analysis: null } as SessionPull;

describe('sessionReducer', () => {
  it('walks the happy path idle → ready → recording → detecting → reviewing → saving → saved', () => {
    let s = drive([ready]);
    expect(s.kind).toBe('ready');
    s = sessionReducer(s, { type: 'START' });
    expect(s.kind).toBe('recording');
    s = sessionReducer(s, { type: 'FINISH' });
    expect(s.kind).toBe('detecting');
    s = sessionReducer(s, { type: 'PULLS_READY', pulls: [somePull] });
    expect(s.kind).toBe('reviewing');
    if (s.kind !== 'reviewing') throw new Error('unreachable');
    expect(s.pulls).toHaveLength(1);
    expect(s.gear_label).toBe('4th');
    s = sessionReducer(s, { type: 'SAVE_START' });
    expect(s.kind).toBe('saving');
    s = sessionReducer(s, { type: 'SAVE_DONE', run_ids: ['r1', 'r2'] });
    expect(s).toEqual({ kind: 'saved', vehicle_id: 'v1', run_ids: ['r1', 'r2'] });
  });

  it('returns to reviewing with pulls intact when saving fails', () => {
    let s = drive([ready, { type: 'START' }, { type: 'FINISH' }, { type: 'PULLS_READY', pulls: [somePull] }, { type: 'SAVE_START' }]);
    s = sessionReducer(s, { type: 'SAVE_FAILED' });
    expect(s.kind).toBe('reviewing');
    if (s.kind !== 'reviewing') throw new Error('unreachable');
    expect(s.pulls).toHaveLength(1);
  });

  it('ignores out-of-order events', () => {
    expect(drive([{ type: 'START' }]).kind).toBe('idle');
    expect(drive([ready, { type: 'FINISH' }]).kind).toBe('ready');
    expect(drive([ready, { type: 'START' }, { type: 'SAVE_START' }]).kind).toBe('recording');
    expect(drive([ready, { type: 'START' }, { type: 'PULLS_READY', pulls: [] }]).kind).toBe('recording');
  });

  it('RESET returns to idle from anywhere', () => {
    const s = drive([ready, { type: 'START' }, { type: 'RESET' }]);
    expect(s.kind).toBe('idle');
  });
});
