import { apiFetch } from '../client';
import type { Calibration } from '@/shared/types';
import type { ICalibrationRepository, NewCalibration } from './types';

export const calibrationRepository: ICalibrationRepository = {
  create: (input: NewCalibration) =>
    apiFetch<Calibration>(`/api/vehicles/${input.vehicle_id}/calibrations`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  get: (id) =>
    apiFetch<Calibration>(`/api/calibrations/${id}`).catch(() => null),

  listByVehicle: (vehicleId) =>
    apiFetch<Calibration[]>(`/api/vehicles/${vehicleId}/calibrations`),

  delete: (id) =>
    apiFetch<void>(`/api/calibrations/${id}`, { method: 'DELETE' }),
};
