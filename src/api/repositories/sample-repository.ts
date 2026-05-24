import { apiFetch } from '../client';
import type { Sample } from '@/shared/types';
import type { ISampleRepository } from './types';

export const sampleRepository: ISampleRepository = {
  insertMany: (samples: Sample[]) => {
    if (samples.length === 0) return Promise.resolve();
    return apiFetch<void>(`/api/runs/${samples[0].run_id}/samples`, {
      method: 'POST',
      body: JSON.stringify(samples),
    });
  },

  listByRun: (runId) =>
    apiFetch<Sample[]>(`/api/runs/${runId}/samples`),

  deleteByRun: (_runId) => Promise.resolve(),
};
