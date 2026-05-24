import type {
  Vehicle, Calibration, Run, Sample, DerivedCurve,
  VehicleKind, Drivetrain, RunConditions,
} from '@/shared/types';

export interface NewVehicle {
  name: string;
  kind: VehicleKind;
  mass_kg: number;
  drivetrain: Drivetrain;
  frontal_area_m2: number | null;
  drag_coefficient: number | null;
  notes: string;
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
