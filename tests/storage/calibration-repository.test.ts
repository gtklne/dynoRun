import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import type { Database } from '@/storage/database';

describe('CalibrationRepository', () => {
  let db: Database;
  let vehicles: VehicleRepository;
  let cals: CalibrationRepository;
  let vehicleId: string;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    vehicles = new VehicleRepository(db);
    cals = new CalibrationRepository(db);
    const v = await vehicles.create({
      name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    vehicleId = v.id;
  });

  it('creates a calibration with computed rollout', async () => {
    const c = await cals.create({
      vehicle_id: vehicleId, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
    });
    expect(c.rollout_m_per_rev).toBeCloseTo(80 / 3.6 / (3000 / 60), 4);
  });

  it('lists calibrations for a vehicle', async () => {
    await cals.create({ vehicle_id: vehicleId, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    await cals.create({ vehicle_id: vehicleId, gear_label: '4th', rpm: 3000, speed_kmh: 100, notes: '' });
    const list = await cals.listByVehicle(vehicleId);
    expect(list).toHaveLength(2);
  });
});
