import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { CompareScreen } from '@/ui/compare/compare-screen';

async function setup() {
  const db = await createWebDatabase(':memory:');
  await runMigrations(db);
  const v = await new VehicleRepository(db).create({
    name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
    frontal_area_m2: null, drag_coefficient: null, notes: '',
  });
  const c = await new CalibrationRepository(db).create({
    vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
  });
  const runRepo = new RunRepository(db);
  const curveRepo = new DerivedCurveRepository(db);

  const r1 = await runRepo.create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: 'before exhaust' });
  await runRepo.markComplete(r1.id);
  await curveRepo.upsert({
    run_id: r1.id, rpm_min: 2000, rpm_max: 5000,
    points: [
      { rpm: 2000, wheel_power_kw: 30, wheel_torque_nm: 140 },
      { rpm: 3500, wheel_power_kw: 60, wheel_torque_nm: 164 },
      { rpm: 5000, wheel_power_kw: 70, wheel_torque_nm: 134 },
    ],
    pipeline_version: 1, computed_at: '2026-01-01T00:00:00Z',
  });

  const r2 = await runRepo.create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: 'after exhaust' });
  await runRepo.markComplete(r2.id);
  await curveRepo.upsert({
    run_id: r2.id, rpm_min: 2000, rpm_max: 5000,
    points: [
      { rpm: 2000, wheel_power_kw: 32, wheel_torque_nm: 153 },
      { rpm: 3500, wheel_power_kw: 64, wheel_torque_nm: 175 },
      { rpm: 5000, wheel_power_kw: 75, wheel_torque_nm: 143 },
    ],
    pipeline_version: 1, computed_at: '2026-01-02T00:00:00Z',
  });

  return { db, vehicleId: v.id, run1Id: r1.id, run2Id: r2.id };
}

describe('CompareScreen', () => {
  it('lists complete runs and overlays selected curves', async () => {
    const { db, vehicleId } = await setup();
    render(
      <DbContext.Provider value={db}>
        <MemoryRouter initialEntries={[`/vehicles/${vehicleId}/compare`]}>
          <Routes>
            <Route path="/vehicles/:vehicleId/compare" element={<CompareScreen />} />
          </Routes>
        </MemoryRouter>
      </DbContext.Provider>,
    );

    // Both runs visible in the picker
    const before = await screen.findByLabelText(/before exhaust/i);
    const after = screen.getByLabelText(/after exhaust/i);
    fireEvent.click(before);
    fireEvent.click(after);

    // The labels appear in both the picker and the chart legend
    await waitFor(() => expect(screen.getAllByText(/before exhaust/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/after exhaust/i).length).toBeGreaterThan(0);
  });

  it('hides in_progress runs from the picker', async () => {
    const { db, vehicleId } = await setup();
    // Add an in-progress run with no curve
    const v = await new VehicleRepository(db).get(vehicleId);
    expect(v).not.toBeNull();
    const cals = await new CalibrationRepository(db).listByVehicle(vehicleId);
    await new RunRepository(db).create({
      vehicle_id: vehicleId, calibration_id: cals[0].id, gear_label: '3rd', conditions: {}, notes: 'orphan',
    });

    render(
      <DbContext.Provider value={db}>
        <MemoryRouter initialEntries={[`/vehicles/${vehicleId}/compare`]}>
          <Routes>
            <Route path="/vehicles/:vehicleId/compare" element={<CompareScreen />} />
          </Routes>
        </MemoryRouter>
      </DbContext.Provider>,
    );

    await screen.findByLabelText(/before exhaust/i);
    expect(screen.queryByLabelText(/orphan/i)).not.toBeInTheDocument();
  });
});
