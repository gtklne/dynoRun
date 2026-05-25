import { useSyncExternalStore } from 'react';
import type { SensorRecording } from './recording';

interface ReplayState {
  active: SensorRecording | null;
  last: SensorRecording | null;
}

let state: ReplayState = { active: null, last: null };
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function getActiveReplay(): SensorRecording | null {
  return state.active;
}

export function setActiveReplay(r: SensorRecording | null): void {
  state = { ...state, active: r };
  notify();
}

export function getLastRecording(): SensorRecording | null {
  return state.last;
}

export function setLastRecording(r: SensorRecording | null): void {
  state = { ...state, last: r };
  notify();
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
