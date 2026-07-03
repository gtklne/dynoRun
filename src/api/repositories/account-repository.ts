import { apiFetch } from '../client';
import type { Vehicle, Calibration, Run, Sample, DerivedCurve } from '@/shared/types';
import type { RecordingSummary } from './types';

export interface AccountExport {
  format_version: number;
  exported_at: string;
  account: { id: string; name: string; email: string; emailVerified: boolean; createdAt: string } | null;
  vehicles: Vehicle[];
  calibrations: Calibration[];
  runs: Run[];
  samples: Sample[];
  derived_curves: DerivedCurve[];
  recordings: RecordingSummary[];
}

export const getAccountExport = () =>
  apiFetch<AccountExport>('/api/account/export');

export const deleteAccount = () =>
  apiFetch<void>('/api/account', { method: 'DELETE' });
