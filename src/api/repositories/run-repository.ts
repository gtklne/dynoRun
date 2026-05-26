import { apiFetch } from '../client';
import type { Run } from '@/shared/types';
import type { IRunRepository, NewRun } from './types';

export const runRepository: IRunRepository = {
  create: (input: NewRun) =>
    apiFetch<Run>('/api/runs', { method: 'POST', body: JSON.stringify(input) }),

  get: (id) =>
    apiFetch<Run>(`/api/runs/${id}`).catch(() => null),

  listByVehicle: (vehicleId) =>
    apiFetch<Run[]>(`/api/vehicles/${vehicleId}/runs`),

  markDegraded: (id) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'degraded' }),
    }),

  markAborted: (id) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'aborted' }),
    }),

  markComplete: (id) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'complete' }),
    }),

  finalize: (id, endedAt) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ended_at: endedAt }),
    }),

  updateNotes: (id, notes) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),

  update: (id, patch) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  delete: (id) =>
    apiFetch<void>(`/api/runs/${id}`, { method: 'DELETE' }),
};
