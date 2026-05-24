import { apiFetch } from '../client';
import type { Vehicle } from '@/shared/types';
import type { IVehicleRepository } from './types';

export const vehicleRepository: IVehicleRepository = {
  list: () =>
    apiFetch<Vehicle[]>('/api/vehicles'),

  get: (id) =>
    apiFetch<Vehicle>(`/api/vehicles/${id}`).catch(() => null),

  create: (input) =>
    apiFetch<Vehicle>('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id, patch) =>
    apiFetch<Vehicle>(`/api/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  delete: (id) =>
    apiFetch<void>(`/api/vehicles/${id}`, { method: 'DELETE' }),
};
