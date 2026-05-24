import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import type { Database } from '@/storage/database';

describe('RunRepository', () => {
  let db: Database;
  let vehicleId: string;
  let calibrationId: string;
  let runs: RunRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({
      name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    vehicleId = v.id;
    const c = await new CalibrationRepository(db).create({
      vehicle_id: vehicleId, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
    });
    calibrationId = c.id;
    runs = new RunRepository(db);
  });

  it('creates a run with conditions JSON round-trip', async () => {
    const r = await runs.create({
      vehicle_id: vehicleId, calibration_id: calibrationId, gear_label: '3rd',
      conditions: { ambient_temp_c: 20, surface: 'asphalt' }, notes: 'baseline',
    });
    const got = await runs.get(r.id);
    expect(got?.conditions).toEqual({ ambient_temp_c: 20, surface: 'asphalt' });
    expect(got?.status).toBe('complete');
  });

  it('lists runs for a vehicle newest first', async () => {
    const a = await runs.create({ vehicle_id: vehicleId, calibration_id: calibrationId, gear_label: '3rd', conditions: {}, notes: '' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await runs.create({ vehicle_id: vehicleId, calibration_id: calibrationId, gear_label: '3rd', conditions: {}, notes: '' });
    const list = await runs.listByVehicle(vehicleId);
    expect(list.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('updates status', async () => {
    const r = await runs.create({ vehicle_id: vehicleId, calibration_id: calibrationId, gear_label: '3rd', conditions: {}, notes: '' });
    await runs.markDegraded(r.id);
    const got = await runs.get(r.id);
    expect(got?.status).toBe('degraded');
  });
});
