import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import type { Database } from '@/storage/database';
import type { Sample } from '@/shared/types';

describe('SampleRepository', () => {
  let db: Database;
  let runId: string;
  let samples: SampleRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const c = await new CalibrationRepository(db).create({ vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    const r = await new RunRepository(db).create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '' });
    runId = r.id;
    samples = new SampleRepository(db);
  });

  it('inserts many samples in one batch and reads them back ordered', async () => {
    const input: Sample[] = [
      { run_id: runId, t_ms: 0, speed_mps: 10, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null },
      { run_id: runId, t_ms: 100, speed_mps: 11, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null },
      { run_id: runId, t_ms: 200, speed_mps: 12, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null },
    ];
    await samples.insertMany(input);
    const got = await samples.listByRun(runId);
    expect(got).toEqual(input);
  });
});
