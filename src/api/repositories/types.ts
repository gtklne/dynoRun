import type {
  Vehicle, Calibration, Run, RunUpdate, Sample, DerivedCurve,
  VehicleKind, Drivetrain, RunConditions, Transmission, BodyShape,
} from '@/shared/types';
import type { GripSettings } from '@/analysis/grip/settings';
import type { StoredGripData } from '@/analysis/grip/storage';

export interface NewVehicle {
  name: string;
  kind: VehicleKind;
  mass_kg: number;
  drivetrain: Drivetrain;
  frontal_area_m2: number | null;
  drag_coefficient: number | null;
  body_shape: BodyShape | null;
  notes: string;
  make: string | null;
  model: string | null;
  year: number | null;
  tire_label: string | null;
  power_hp_factory: number | null;
  transmission: Transmission | null;
}

export interface NewCalibration {
  vehicle_id: string;
  gear_label: string;
  rpm: number;
  speed_kmh: number;
  notes: string;
}

export interface NewRun {
  vehicle_id: string;
  calibration_id: string;
  gear_label: string;
  conditions: RunConditions;
  notes: string;
}

export interface IVehicleRepository {
  create(input: NewVehicle): Promise<Vehicle>;
  get(id: string): Promise<Vehicle | null>;
  list(): Promise<Vehicle[]>;
  update(id: string, patch: Partial<NewVehicle>): Promise<Vehicle>;
  delete(id: string): Promise<void>;
}

export interface ICalibrationRepository {
  create(input: NewCalibration): Promise<Calibration>;
  get(id: string): Promise<Calibration | null>;
  listByVehicle(vehicleId: string): Promise<Calibration[]>;
  delete(id: string): Promise<void>;
}

export interface IRunRepository {
  create(input: NewRun): Promise<Run>;
  get(id: string): Promise<Run | null>;
  listByVehicle(vehicleId: string): Promise<Run[]>;
  markDegraded(id: string): Promise<void>;
  markAborted(id: string): Promise<void>;
  markComplete(id: string): Promise<void>;
  finalize(id: string, endedAt: string): Promise<void>;
  updateNotes(id: string, notes: string): Promise<void>;
  update(id: string, patch: RunUpdate): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ISampleRepository {
  insertMany(samples: Sample[]): Promise<void>;
  listByRun(runId: string): Promise<Sample[]>;
  deleteByRun(runId: string): Promise<void>;
}

export interface IDerivedCurveRepository {
  upsert(curve: DerivedCurve): Promise<void>;
  getByRun(runId: string): Promise<DerivedCurve | null>;
}

export interface RecordingSummary {
  id: string;
  kind: 'run' | 'calibration';
  vehicle_id: string | null;
  calibration_id: string | null;
  run_id: string | null;
  gear_label: string | null;
  user_rpm: number | null;
  label: string | null;
  recorded_at: string;
  duration_ms: number;
  gps_count: number;
  motion_count: number;
  created_at: string;
}

export interface NewRecording {
  kind: 'run' | 'calibration';
  vehicle_id?: string | null;
  calibration_id?: string | null;
  run_id?: string | null;
  gear_label?: string | null;
  user_rpm?: number | null;
  label?: string | null;
  recorded_at: string;
  duration_ms: number;
  data: { gps_fixes: unknown[]; motion_fixes: unknown[] };
}

export interface IRecordingRepository {
  list(): Promise<RecordingSummary[]>;
  get(id: string): Promise<(RecordingSummary & { data: { gps_fixes: unknown[]; motion_fixes: unknown[] } }) | null>;
  create(input: NewRecording): Promise<RecordingSummary>;
  setLabel(id: string, label: string | null): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface GripSessionSummary {
  id: string;
  vehicle_id: string | null;
  label: string | null;
  track: string;
  config: string;
  session_date: string;
  best_lap_s: number | null;
  lap_count: number;
  sample_count: number;
  duration_s: number;
  created_at: string;
  updated_at: string;
}

export type GripSessionFull = GripSessionSummary & {
  /** tuned settings as last saved; null = defaults */
  settings: unknown;
  data: StoredGripData;
};

export interface NewGripSession {
  label?: string | null;
  vehicle_id?: string | null;
  settings?: GripSettings;
  data: StoredGripData;
}

export interface GripSessionPatch {
  label?: string | null;
  vehicle_id?: string | null;
  settings?: GripSettings;
}

export interface IGripSessionRepository {
  list(): Promise<GripSessionSummary[]>;
  get(id: string): Promise<GripSessionFull | null>;
  create(input: NewGripSession): Promise<GripSessionSummary>;
  update(id: string, patch: GripSessionPatch): Promise<void>;
  delete(id: string): Promise<void>;
}
