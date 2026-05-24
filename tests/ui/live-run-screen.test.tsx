import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { LiveRunScreen } from '@/ui/run/live-run-screen';
import { SpeedSourceContext } from '@/ui/calibration/speed-source-context';
import { MockSpeedSource } from '@/sensors/mock-speed-source';

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
  return { db, vehicleId: v.id, calibrationId: c.id };
}

function buildScript() {
  const out = [];
  let v = 30 / 3.6;
  let t = 0;
  for (; t <= 1000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  for (; t <= 9000; t += 100) {
    v += 2 * 0.1;
    out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  }
  for (; t <= 11000; t += 100) out.push({ t_ms: t, value: { speed_mps: v }, quality: 1 });
  return out;
}

describe('LiveRunScreen', () => {
  it('records, auto-stops, analyzes, and shows the review state', async () => {
    const { db, vehicleId, calibrationId } = await setup();
    const speedSrc = new MockSpeedSource('mock', buildScript());

    // Render without fake timers first so the async useEffect (ctrl.ready) can
    // resolve via real microtasks and put the screen in 'ready' state.
    await act(async () => {
      render(
        <DbContext.Provider value={db}>
          <SpeedSourceContext.Provider value={() => speedSrc}>
            <MemoryRouter initialEntries={[`/vehicles/${vehicleId}/calibrations/${calibrationId}/run`]}>
              <Routes>
                <Route
                  path="/vehicles/:vehicleId/calibrations/:calibrationId/run"
                  element={<LiveRunScreen />}
                />
                <Route path="/vehicles/:vehicleId" element={<div>vehicle detail</div>} />
                <Route path="/runs/:runId/review" element={<div>review</div>} />
              </Routes>
            </MemoryRouter>
          </SpeedSourceContext.Provider>
        </DbContext.Provider>,
      );
    });

    // Now the screen should be in 'ready' state — Start run button is visible
    const startBtn = screen.getByRole('button', { name: /start run/i });

    // Install fake timers now (AFTER ctrl.ready has resolved) so that
    // mock sensor setTimeout calls are interceptable.
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(startBtn);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.useRealTimers();

    // After real timers are restored, navigation should have happened
    expect(screen.getByText(/review/i)).toBeInTheDocument();
  });
});
