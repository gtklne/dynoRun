import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import type { Database } from '@/storage/database';

describe('DerivedCurveRepository', () => {
  let db: Database;
  let runId: string;
  let curves: DerivedCurveRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const c = await new CalibrationRepository(db).create({ vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    const r = await new RunRepository(db).create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '' });
    runId = r.id;
    curves = new DerivedCurveRepository(db);
  });

  it('upserts a curve and reads it back', async () => {
    await curves.upsert({
      run_id: runId,
      rpm_min: 2000,
      rpm_max: 6000,
      points: [
        { rpm: 2000, wheel_power_kw: 40, wheel_torque_nm: 190 },
        { rpm: 4000, wheel_power_kw: 80, wheel_torque_nm: 191 },
      ],
      pipeline_version: 1,
      computed_at: '2026-05-24T00:00:00Z',
    });
    const got = await curves.getByRun(runId);
    expect(got?.points).toHaveLength(2);
    expect(got?.pipeline_version).toBe(1);
  });

  it('overwrites on second upsert', async () => {
    await curves.upsert({ run_id: runId, rpm_min: 0, rpm_max: 1, points: [], pipeline_version: 1, computed_at: '2026-05-24T00:00:00Z' });
    await curves.upsert({ run_id: runId, rpm_min: 0, rpm_max: 2, points: [{ rpm: 1, wheel_power_kw: 1, wheel_torque_nm: 1 }], pipeline_version: 2, computed_at: '2026-05-24T00:01:00Z' });
    const got = await curves.getByRun(runId);
    expect(got?.pipeline_version).toBe(2);
    expect(got?.rpm_max).toBe(2);
  });
});
