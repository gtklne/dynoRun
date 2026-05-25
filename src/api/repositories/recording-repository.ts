import { apiFetch } from '../client';
import type {
  IRecordingRepository,
  NewRecording,
  RecordingSummary,
} from './types';

type FullRecording = RecordingSummary & { data: { gps_fixes: unknown[]; motion_fixes: unknown[] } };

export const recordingRepository: IRecordingRepository = {
  list: () => apiFetch<RecordingSummary[]>('/api/recordings'),

  get: (id) =>
    apiFetch<FullRecording>(`/api/recordings/${id}`).catch(() => null),

  create: (input: NewRecording) =>
    apiFetch<RecordingSummary>('/api/recordings', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  setLabel: (id, label) =>
    apiFetch<void>(`/api/recordings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label }),
    }),

  delete: (id) =>
    apiFetch<void>(`/api/recordings/${id}`, { method: 'DELETE' }),
};
