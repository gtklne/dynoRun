import { apiFetch } from '../client';
import type { DerivedCurve } from '@/shared/types';
import type { IDerivedCurveRepository } from './types';

export const derivedCurveRepository: IDerivedCurveRepository = {
  upsert: (curve: DerivedCurve) =>
    apiFetch<void>(`/api/runs/${curve.run_id}/curve`, {
      method: 'PUT',
      body: JSON.stringify(curve),
    }),

  getByRun: (runId) =>
    apiFetch<DerivedCurve>(`/api/runs/${runId}/curve`).catch(() => null),
};
