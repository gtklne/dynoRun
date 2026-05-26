import { describe, it, expect } from 'vitest';
import { createDatabaseDump, EXPORT_FORMAT_VERSION } from '@/app/export';
import type { Vehicle, Calibration, Run, Sample, DerivedCurve } from '@/shared/types';

describe('createDatabaseDump', () => {
  it('returns a JSON object with all 5 tables and a format version', () => {
    const vehicle: Vehicle = {
      id: '1', user_id: null, name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
      make: null, model: null, year: null, tire_label: null, power_hp_factory: null, transmission: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', synced_at: null,
    };
    const calibration: Calibration = {
      id: '1', user_id: null, vehicle_id: '1', gear_label: '3rd', rpm: 3000, speed_kmh: 80,
      rollout_m_per_rev: 2.1, recorded_at: '2026-01-01T00:00:00Z', notes: '', created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', synced_at: null,
    };
    const run: Run = {
      id: '1', user_id: null, vehicle_id: '1', calibration_id: '1', gear_label: '3rd', conditions: {},
      notes: '', status: 'complete', started_at: '2026-01-01T00:00:00Z', ended_at: '2026-01-01T00:01:00Z',
      title: null, peak_power_kw: null, peak_torque_nm: null, peak_power_rpm: null, share_token: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', synced_at: null,
    };
    const sample: Sample = {
      run_id: '1', t_ms: 0, speed_mps: 10, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null,
    };
    const derivedCurve: DerivedCurve = {
      run_id: '1', rpm_min: 0, rpm_max: 1,
      points: [{ rpm: 1, wheel_power_kw: 1, wheel_torque_nm: 1 }],
      pipeline_version: 1, computed_at: '2026-01-01T00:00:00Z',
    };

    const dump = createDatabaseDump(
      [vehicle],
      [calibration],
      [run],
      [sample],
      [derivedCurve],
    );
    expect(dump.format_version).toBe(EXPORT_FORMAT_VERSION);
    expect(dump.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dump.vehicles).toHaveLength(1);
    expect(dump.calibrations).toHaveLength(1);
    expect(dump.runs).toHaveLength(1);
    expect(dump.samples).toHaveLength(1);
    expect(dump.derived_curves).toHaveLength(1);
  });

  it('preserves runs.conditions and derived_curves.points as objects', () => {
    const vehicle: Vehicle = {
      id: '1', user_id: null, name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
      make: null, model: null, year: null, tire_label: null, power_hp_factory: null, transmission: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', synced_at: null,
    };
    const calibration: Calibration = {
      id: '1', user_id: null, vehicle_id: '1', gear_label: '3rd', rpm: 3000, speed_kmh: 80,
      rollout_m_per_rev: 2.1, recorded_at: '2026-01-01T00:00:00Z', notes: '', created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', synced_at: null,
    };
    const run: Run = {
      id: '1', user_id: null, vehicle_id: '1', calibration_id: '1', gear_label: '3rd',
      conditions: { ambient_temp_c: 20 }, notes: '', status: 'complete',
      started_at: '2026-01-01T00:00:00Z', ended_at: '2026-01-01T00:01:00Z',
      title: null, peak_power_kw: null, peak_torque_nm: null, peak_power_rpm: null, share_token: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', synced_at: null,
    };

    const dump = createDatabaseDump([vehicle], [calibration], [run], [], []);
    expect(dump.runs[0].conditions).toEqual({ ambient_temp_c: 20 });
  });
});
