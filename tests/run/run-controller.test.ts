import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import { RunController } from '@/run/run-controller';
import type { Database } from '@/storage/database';
import type { RunState } from '@/run/types';

async function setup(db: Database) {
  await runMigrations(db);
  const v = await new VehicleRepository(db).create({
    name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
    frontal_area_m2: null, drag_coefficient: null, notes: '',
  });
  const c = await new CalibrationRepository(db).create({
    vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
  });
  return { vehicleId: v.id, calibrationId: c.id };
}

function buildScript(): { t_ms: number; value: { speed_mps: number }; quality: number }[] {
  const out = [];
  let v = 30 / 3.6;
  let t = 0;
  for (; t <= 1000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  for (; t <= 9000; t += 100) {
    v += 2 * 0.1;
    out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  }
  // tail of lift: constant speed for 1 second after the pull
  for (; t <= 11000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  return out;
}

describe('RunController', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
  });

  it('records samples, auto-stops, analyzes, and persists a derived curve', async () => {
    vi.useFakeTimers();
    const { vehicleId, calibrationId } = await setup(db);
    const sensor = new MockSpeedSource('mock', buildScript());
    const states: RunState[] = [];

    const ctrl = new RunController({
      sensor,
      vehicleRepository: new VehicleRepository(db),
      calibrationRepository: new CalibrationRepository(db),
      runRepository: new RunRepository(db),
      sampleRepository: new SampleRepository(db),
      derivedCurveRepository: new DerivedCurveRepository(db),
      onStateChange: (s) => states.push(s),
    });

    await ctrl.ready(vehicleId, calibrationId);
    await ctrl.start();
    await vi.advanceTimersByTimeAsync(12000);
    // The auto-stop should have fired during the post-pull constant-speed tail.
    expect(states.some((s) => s.kind === 'analyzing')).toBe(true);

    // Wait one microtask for analysis to complete.
    await vi.runAllTimersAsync();
    expect(states.some((s) => s.kind === 'reviewing')).toBe(true);

    const final = states[states.length - 1];
    expect(final.kind).toBe('reviewing');
    const runId = (final as { run_id: string }).run_id;
    const curve = await new DerivedCurveRepository(db).getByRun(runId);
    expect(curve).not.toBeNull();
    expect(curve!.points.length).toBeGreaterThan(3);

    await ctrl.save('baseline');
    expect(states[states.length - 1].kind).toBe('saved');

    vi.useRealTimers();
  });

  it('discard() marks the run aborted', async () => {
    vi.useFakeTimers();
    const { vehicleId, calibrationId } = await setup(db);
    const sensor = new MockSpeedSource('mock', buildScript());
    const ctrl = new RunController({
      sensor,
      vehicleRepository: new VehicleRepository(db),
      calibrationRepository: new CalibrationRepository(db),
      runRepository: new RunRepository(db),
      sampleRepository: new SampleRepository(db),
      derivedCurveRepository: new DerivedCurveRepository(db),
      onStateChange: () => {},
    });
    await ctrl.ready(vehicleId, calibrationId);
    await ctrl.start();
    await vi.advanceTimersByTimeAsync(12000);
    await vi.runAllTimersAsync();
    await ctrl.discard();
    expect(ctrl.getState().kind).toBe('aborted');
    vi.useRealTimers();
  });

  it('discard during running stops the sensor and aborts', async () => {
    vi.useFakeTimers();
    const { vehicleId, calibrationId } = await setup(db);
    const sensor = new MockSpeedSource('mock', buildScript());
    const stopSpy = vi.spyOn(sensor, 'stop');
    const ctrl = new RunController({
      sensor,
      vehicleRepository: new VehicleRepository(db),
      calibrationRepository: new CalibrationRepository(db),
      runRepository: new RunRepository(db),
      sampleRepository: new SampleRepository(db),
      derivedCurveRepository: new DerivedCurveRepository(db),
      onStateChange: () => {},
    });
    await ctrl.ready(vehicleId, calibrationId);
    await ctrl.start();
    await vi.advanceTimersByTimeAsync(500);
    await ctrl.discard();
    expect(stopSpy).toHaveBeenCalled();
    expect(ctrl.getState().kind).toBe('aborted');
    vi.useRealTimers();
  });

  it('surfaces finishRun errors via onError', async () => {
    vi.useFakeTimers();
    const { vehicleId, calibrationId } = await setup(db);
    const sensor = new MockSpeedSource('mock', buildScript());
    const errors: unknown[] = [];

    // Break the vehicle repository so analysis fails partway through.
    const vRepo = new VehicleRepository(db);
    vi.spyOn(vRepo, 'get').mockRejectedValue(new Error('boom'));

    const ctrl = new RunController({
      sensor,
      vehicleRepository: vRepo,
      calibrationRepository: new CalibrationRepository(db),
      runRepository: new RunRepository(db),
      sampleRepository: new SampleRepository(db),
      derivedCurveRepository: new DerivedCurveRepository(db),
      onStateChange: () => {},
      onError: (e) => errors.push(e),
    });
    await ctrl.ready(vehicleId, calibrationId);
    await ctrl.start();
    await vi.advanceTimersByTimeAsync(12000);
    await vi.runAllTimersAsync();
    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0])).toMatch(/boom/);
    vi.useRealTimers();
  });
});
