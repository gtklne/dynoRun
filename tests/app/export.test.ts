import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { exportDatabase, EXPORT_FORMAT_VERSION } from '@/app/export';
import type { Database } from '@/storage/database';

describe('exportDatabase', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
  });

  it('returns a JSON object with all 5 tables and a format version', async () => {
    const v = await new VehicleRepository(db).create({
      name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    const c = await new CalibrationRepository(db).create({
      vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
    });
    const r = await new RunRepository(db).create({
      vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '',
    });
    await new SampleRepository(db).insertMany([
      { run_id: r.id, t_ms: 0, speed_mps: 10, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null },
    ]);
    await new DerivedCurveRepository(db).upsert({
      run_id: r.id, rpm_min: 0, rpm_max: 1,
      points: [{ rpm: 1, wheel_power_kw: 1, wheel_torque_nm: 1 }],
      pipeline_version: 1, computed_at: '2026-01-01T00:00:00Z',
    });

    const dump = await exportDatabase(db);
    expect(dump.format_version).toBe(EXPORT_FORMAT_VERSION);
    expect(dump.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dump.vehicles).toHaveLength(1);
    expect(dump.calibrations).toHaveLength(1);
    expect(dump.runs).toHaveLength(1);
    expect(dump.samples).toHaveLength(1);
    expect(dump.derived_curves).toHaveLength(1);
  });

  it('parses runs.conditions and derived_curves.points back into objects', async () => {
    const v = await new VehicleRepository(db).create({
      name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    const c = await new CalibrationRepository(db).create({
      vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
    });
    await new RunRepository(db).create({
      vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd',
      conditions: { ambient_temp_c: 20 }, notes: '',
    });
    const dump = await exportDatabase(db);
    expect(dump.runs[0].conditions).toEqual({ ambient_temp_c: 20 });
  });
});
