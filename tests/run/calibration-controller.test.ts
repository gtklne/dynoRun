import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import { CalibrationController } from '@/run/calibration-controller';
import type { Database } from '@/storage/database';
import type { CalibrationState } from '@/run/types';

describe('CalibrationController', () => {
  let db: Database;
  let vehicleId: string;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({
      name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    vehicleId = v.id;
  });

  it('drives idle -> measuring -> stable on stable input', async () => {
    vi.useFakeTimers();
    const samples = [
      { t_ms: 0, value: { speed_mps: 22.2 }, quality: 1 },
      { t_ms: 1000, value: { speed_mps: 22.25 }, quality: 1 },
      { t_ms: 2000, value: { speed_mps: 22.2 }, quality: 1 },
      { t_ms: 3000, value: { speed_mps: 22.18 }, quality: 1 },
      { t_ms: 4000, value: { speed_mps: 22.22 }, quality: 1 },
      { t_ms: 5000, value: { speed_mps: 22.2 }, quality: 1 },
      { t_ms: 6000, value: { speed_mps: 22.21 }, quality: 1 },
    ];
    const sensor = new MockSpeedSource('mock', samples);
    const states: CalibrationState[] = [];
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: new CalibrationRepository(db),
      onStateChange: (s) => states.push(s),
    });

    await ctrl.start({ gear_label: '3rd', user_rpm: 3000 });
    await vi.advanceTimersByTimeAsync(7000);
    await ctrl.stop();

    const kinds = states.map((s) => s.kind);
    expect(kinds).toContain('measuring');
    expect(kinds).toContain('stable');
    const stable = states.find((s) => s.kind === 'stable');
    expect(stable && 'captured_speed_kmh' in stable && stable.captured_speed_kmh).toBeCloseTo(80, 0);

    vi.useRealTimers();
  });

  it('confirm() persists a calibration with the captured speed', async () => {
    vi.useFakeTimers();
    const samples = Array.from({ length: 12 }, (_, i) => ({
      t_ms: i * 500,
      value: { speed_mps: 22.2 },
      quality: 1,
    }));
    const sensor = new MockSpeedSource('mock', samples);
    const calRepo = new CalibrationRepository(db);
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: calRepo,
      onStateChange: () => {},
    });

    await ctrl.start({ gear_label: '3rd', user_rpm: 3000 });
    await vi.advanceTimersByTimeAsync(7000);
    const cal = await ctrl.confirm();
    await ctrl.stop();

    expect(cal.gear_label).toBe('3rd');
    expect(cal.rpm).toBe(3000);
    expect(cal.speed_kmh).toBeCloseTo(80, 0);
    expect(cal.vehicle_id).toBe(vehicleId);
    const persisted = await calRepo.listByVehicle(vehicleId);
    expect(persisted).toHaveLength(1);

    vi.useRealTimers();
  });

  it('throws if confirm() called outside stable state', async () => {
    const sensor = new MockSpeedSource('mock', []);
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository: new CalibrationRepository(db),
      onStateChange: () => {},
    });
    await expect(ctrl.confirm()).rejects.toThrow(/stable/i);
  });
});
