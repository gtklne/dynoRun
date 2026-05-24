import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository, computeRollout } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { analyzeRun } from '@/analysis/pipeline';
import { nowIso } from '@/shared/iso-time';
import type { Database } from '@/storage/database';
import type { Sample } from '@/shared/types';

function generateRun(): { samples: { t_ms: number; speed_mps: number }[]; massKg: number; rolloutMPerRev: number } {
  const samples: { t_ms: number; speed_mps: number }[] = [];
  let v = 30 / 3.6;
  let t = 0;
  for (; t <= 1000; t += 100) samples.push({ t_ms: t, speed_mps: v });
  for (; t <= 9000; t += 100) {
    v += 2 * 0.1;
    samples.push({ t_ms: t, speed_mps: v });
  }
  return { samples, massKg: 1300, rolloutMPerRev: computeRollout(3000, 80) };
}

describe('e2e: fixture → analysis → persisted derived curve', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
  });

  it('runs end-to-end and stores a non-trivial curve', async () => {
    const vehicles = new VehicleRepository(db);
    const cals = new CalibrationRepository(db);
    const runs = new RunRepository(db);
    const samplesRepo = new SampleRepository(db);
    const curves = new DerivedCurveRepository(db);

    const v = await vehicles.create({
      name: 'Test Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    const c = await cals.create({ vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    const r = await runs.create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '' });

    const fixture = generateRun();
    const samples: Sample[] = fixture.samples.map((s) => ({
      run_id: r.id, t_ms: s.t_ms, speed_mps: s.speed_mps,
      accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null,
    }));
    await samplesRepo.insertMany(samples);

    const result = analyzeRun({
      samples: fixture.samples,
      mass_kg: fixture.massKg,
      rollout_m_per_rev: fixture.rolloutMPerRev,
    });

    await curves.upsert({
      run_id: r.id,
      rpm_min: result.rpm_min,
      rpm_max: result.rpm_max,
      points: result.points,
      pipeline_version: result.pipeline_version,
      computed_at: nowIso(),
    });

    const stored = await curves.getByRun(r.id);
    expect(stored).not.toBeNull();
    expect(stored!.points.length).toBeGreaterThan(5);
    const peak = Math.max(...stored!.points.map((p) => p.wheel_power_kw));
    expect(peak).toBeGreaterThan(20);
    expect(peak).toBeLessThan(100);
  });
});
