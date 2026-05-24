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
import { RunReviewScreen } from '@/ui/run/run-review-screen';

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
  const r = await new RunRepository(db).create({
    vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '',
  });
  await new DerivedCurveRepository(db).upsert({
    run_id: r.id,
    rpm_min: 2000, rpm_max: 6000,
    points: [
      { rpm: 2000, wheel_power_kw: 40, wheel_torque_nm: 190 },
      { rpm: 4000, wheel_power_kw: 80, wheel_torque_nm: 191 },
      { rpm: 6000, wheel_power_kw: 100, wheel_torque_nm: 160 },
    ],
    pipeline_version: 1,
    computed_at: '2026-05-24T00:00:00Z',
  });
  return { db, runId: r.id, vehicleId: v.id };
}

describe('RunReviewScreen', () => {
  it('renders the curve and saves notes', async () => {
    const { db, runId, vehicleId } = await setup();
    render(
      <DbContext.Provider value={db}>
        <MemoryRouter initialEntries={[`/runs/${runId}/review`]}>
          <Routes>
            <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
            <Route path="/vehicles/:vehicleId" element={<div>vehicle detail</div>} />
          </Routes>
        </MemoryRouter>
      </DbContext.Provider>,
    );
    expect(await screen.findByText(/Peak power/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: 'baseline' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByText(/vehicle detail/i)).toBeInTheDocument());
    const saved = await new RunRepository(db).get(runId);
    expect(saved?.notes).toBe('baseline');
    expect(saved?.status).toBe('complete');
    expect(vehicleId).toBeDefined();
  });
});
