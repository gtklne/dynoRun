export type UUID = string;
export type IsoTime = string;

export type VehicleKind = 'car' | 'motorcycle';
export type Drivetrain = 'fwd' | 'rwd' | 'awd' | 'chain' | 'shaft';
export type RunStatus = 'in_progress' | 'complete' | 'degraded' | 'aborted';

export interface Vehicle {
  id: UUID;
  user_id: UUID | null;
  name: string;
  kind: VehicleKind;
  mass_kg: number;
  drivetrain: Drivetrain;
  frontal_area_m2: number | null;
  drag_coefficient: number | null;
  notes: string;
  created_at: IsoTime;
  updated_at: IsoTime;
  synced_at: IsoTime | null;
}

export interface Calibration {
  id: UUID;
  user_id: UUID | null;
  vehicle_id: UUID;
  gear_label: string;
  rpm: number;
  speed_kmh: number;
  rollout_m_per_rev: number;
  recorded_at: IsoTime;
  notes: string;
  created_at: IsoTime;
  updated_at: IsoTime;
  synced_at: IsoTime | null;
}

export interface RunConditions {
  ambient_temp_c?: number;
  wind_kmh?: number;
  road_slope_pct?: number;
  surface?: string;
}

export interface Run {
  id: UUID;
  user_id: UUID | null;
  vehicle_id: UUID;
  calibration_id: UUID;
  started_at: IsoTime;
  ended_at: IsoTime | null;
  gear_label: string;
  conditions: RunConditions;
  notes: string;
  status: RunStatus;
  created_at: IsoTime;
  updated_at: IsoTime;
  synced_at: IsoTime | null;
}

export interface Sample {
  run_id: UUID;
  t_ms: number;
  speed_mps: number;
  accel_long_ms2: number | null;
  accel_vert_ms2: number | null;
  lat: number | null;
  lon: number | null;
  hdop: number | null;
}

export interface RpmPoint {
  rpm: number;
  wheel_power_kw: number;
  wheel_torque_nm: number;
}

export interface DerivedCurve {
  run_id: UUID;
  rpm_min: number;
  rpm_max: number;
  points: RpmPoint[];
  pipeline_version: number;
  computed_at: IsoTime;
}
