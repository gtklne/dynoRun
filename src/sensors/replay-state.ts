import { useSyncExternalStore } from 'react';
import type { SensorRecording } from './recording';

interface ReplayState {
  /** The most recent run/calibration recording, held in memory for one-tap replay. */
  last: SensorRecording | null;
}

let state: ReplayState = { last: null };
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function getLastRecording(): SensorRecording | null {
  return state.last;
}

export function setLastRecording(r: SensorRecording | null): void {
  state = { ...state, last: r };
  notify();
}

// In-memory handoff for the Replay Lab. Used for recordings that have no DB id
// (an uploaded JSON, or the in-memory `last`), which therefore can't be reached
// via /replay/:recordingId. A full recording is too large for router history state,
// so it's parked here and read by the player at /replay/local. Read is non-destructive
// so React StrictMode's dev remount (which re-runs effects) reads the same value;
// it resets on a full page reload, so a stale /replay/local then redirects to /replay.
let pending: SensorRecording | null = null;

export function setPendingReplay(r: SensorRecording): void {
  pending = r;
}

export function getPendingReplay(): SensorRecording | null {
  return pending;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function snapshot(): ReplayState {
  return state;
}

export function useReplayState(): ReplayState {
  return useSyncExternalStore(subscribe, snapshot);
}
