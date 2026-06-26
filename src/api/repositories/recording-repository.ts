import { apiFetch } from '../client';
import type {
  IRecordingRepository,
  NewRecording,
  RecordingSummary,
} from './types';
import type { RawGpsFix, RawMotionFix, SensorRecording } from '@/sensors/recording';

type FullRecording = RecordingSummary & { data: { gps_fixes: unknown[]; motion_fixes: unknown[] } };

/** Reconstruct the in-memory SensorRecording envelope from a stored row. */
export function toSensorRecording(full: FullRecording): SensorRecording {
  return {
    version: 1,
    kind: full.kind,
    recorded_at: full.recorded_at,
    duration_ms: full.duration_ms,
    meta: {
      vehicle_id: full.vehicle_id ?? undefined,
      calibration_id: full.calibration_id ?? undefined,
      run_id: full.run_id ?? undefined,
      gear_label: full.gear_label ?? undefined,
      user_rpm: full.user_rpm ?? undefined,
      label: full.label ?? undefined,
    },
    gps_fixes: full.data.gps_fixes as RawGpsFix[],
    motion_fixes: full.data.motion_fixes as RawMotionFix[],
  };
}

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
