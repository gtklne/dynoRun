import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { CalibrationWizardScreen } from '@/ui/calibration/calibration-wizard-screen';
import { SpeedSourceContext } from '@/ui/calibration/speed-source-context';
import { MockSpeedSource } from '@/sensors/mock-speed-source';

async function setup() {
  const db = await createWebDatabase(':memory:');
  await runMigrations(db);
  const v = await new VehicleRepository(db).create({
    name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
    frontal_area_m2: null, drag_coefficient: null, notes: '',
  });
  return { db, vehicleId: v.id };
}

describe('CalibrationWizardScreen', () => {
  it('captures a steady speed and persists a calibration', { timeout: 15000 }, async () => {
    vi.useFakeTimers();
    const { db, vehicleId } = await setup();
    const samples = Array.from({ length: 16 }, (_, i) => ({
      t_ms: i * 500,
      value: { speed_mps: 22.22 },
      quality: 1,
    }));
    const speedSrc = new MockSpeedSource('mock', samples);

    render(
      <DbContext.Provider value={db}>
        <SpeedSourceContext.Provider value={() => speedSrc}>
          <MemoryRouter initialEntries={[`/vehicles/${vehicleId}/calibrations/new`]}>
            <Routes>
              <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
              <Route path="/vehicles/:vehicleId" element={<div>vehicle detail</div>} />
            </Routes>
          </MemoryRouter>
        </SpeedSourceContext.Provider>
      </DbContext.Provider>,
    );

    // Step 1: choose gear and RPM
    fireEvent.change(screen.getByLabelText(/gear/i), { target: { value: '3rd' } });
    fireEvent.change(screen.getByLabelText(/target rpm/i), { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    // Step 2: start measurement, advance time until stability
    // After clicking Next, the measure step renders synchronously
    fireEvent.click(screen.getByRole('button', { name: /start measurement/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    // After advancing timers, state should be 'stable' — find the confirm button synchronously
    const confirm = screen.getByRole('button', { name: /save calibration/i });
    await act(async () => {
      fireEvent.click(confirm);
    });

    // Step 3: now on the "Done" confirm screen; click "Done" to navigate
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /done/i }));
    });
    expect(screen.getByText(/vehicle detail/i)).toBeInTheDocument();

    const persisted = await new CalibrationRepository(db).listByVehicle(vehicleId);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].rpm).toBe(3000);
    expect(persisted[0].speed_kmh).toBeCloseTo(80, 0);

    vi.useRealTimers();
  });
});
