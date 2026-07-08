import { apiFetch } from '../client';
import type {
  GripSessionFull,
  GripSessionPatch,
  GripSessionSummary,
  IGripSessionRepository,
  NewGripSession,
} from './types';

export const gripSessionRepository: IGripSessionRepository = {
  list: () => apiFetch<GripSessionSummary[]>('/api/grip-sessions'),

  get: (id) => apiFetch<GripSessionFull>(`/api/grip-sessions/${id}`).catch(() => null),

  create: (input: NewGripSession) =>
    apiFetch<GripSessionSummary>('/api/grip-sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id, patch: GripSessionPatch) =>
    apiFetch<void>(`/api/grip-sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  delete: (id) => apiFetch<void>(`/api/grip-sessions/${id}`, { method: 'DELETE' }),
};
