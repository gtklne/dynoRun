import { apiFetch } from './client';

export interface AdminOverview {
  users: { total: number; new_7d: number; new_30d: number };
  activity: { active_7d: number; active_30d: number };
  content: {
    vehicles: number;
    calibrations: number;
    runs_total: number;
    runs_complete: number;
    runs_aborted: number;
    runs_shared: number;
    recordings: number;
    samples: number;
  };
  health: {
    db_size: string;
    samples_size: string;
    recordings_size: string;
    stuck_runs: number;
    curve_versions: Array<{ version: number; count: number }>;
  };
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface AdminTimeseries {
  days: number;
  signups: DailyCount[];
  runs: DailyCount[];
  recordings: DailyCount[];
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_active: string | null;
  vehicle_count: number;
  run_count: number;
  recording_count: number;
  last_run_at: string | null;
}

export interface AdminRecentRun {
  id: string;
  status: string;
  started_at: string;
  gear_label: string;
  peak_power_kw: number | null;
  title: string | null;
  user_email: string;
  vehicle_name: string | null;
}

export interface AdminTopRun {
  id: string;
  started_at: string;
  gear_label: string;
  peak_power_kw: number;
  peak_power_rpm: number | null;
  user_email: string;
  vehicle_name: string | null;
  vehicle_kind: string | null;
}

export interface AdminDistributionEntry {
  label: string;
  count: number;
}

export interface AdminActivity {
  recent_runs: AdminRecentRun[];
  top_runs: AdminTopRun[];
  vehicle_kinds: AdminDistributionEntry[];
  drivetrains: AdminDistributionEntry[];
}

export const fetchAdminOverview = () => apiFetch<AdminOverview>('/api/admin/overview');
export const fetchAdminTimeseries = (days: number) =>
  apiFetch<AdminTimeseries>(`/api/admin/timeseries?days=${days}`);
export const fetchAdminUsers = () => apiFetch<AdminUserRow[]>('/api/admin/users');
export const fetchAdminActivity = () => apiFetch<AdminActivity>('/api/admin/activity');
