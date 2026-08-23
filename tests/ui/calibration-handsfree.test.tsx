import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Vehicle, VehicleKind } from '@/shared/types';

const getVehicle = vi.fn<(id: string) => Promise<Vehicle | null>>();

vi.mock('@/api/repositories/vehicle-repository', () => ({
  vehicleRepository: {
    get: (id: string) => getVehicle(id),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/api/repositories/calibration-repository', () => ({
  calibrationRepository: {
    create: vi.fn(),
    get: vi.fn(),
    listByVehicle: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/api/repositories/recording-repository', () => ({
  recordingRepository: {
    create: vi.fn(async () => ({})),
    get: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { CalibrationWizardScreen } from '@/ui/calibration/calibration-wizard-screen';
import { SpeedSourceContext } from '@/ui/calibration/speed-source-context';
import { ToastProvider } from '@/ui/components/toast';
import { Subject } from '@/shared/observable';
import type { SpeedSource, SensorSample, SpeedValue, SensorError, Capability } from '@/sensors/types';

class FakeSpeedSource implements SpeedSource {
  readonly id = 'fake';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  readonly errors$ = new Subject<SensorError>();
  started = 0;
  stopped = 0;
  async start(): Promise<void> { this.started++; }
  async stop(): Promise<void> { this.stopped++; }
}

function vehicle(kind: VehicleKind): Vehicle {
  return {
    id: 'v1', user_id: null, name: kind === 'motorcycle' ? 'SV650' : 'Golf', kind, mass_kg: 280,
    drivetrain: kind === 'motorcycle' ? 'chain' : 'fwd',
    frontal_area_m2: null, drag_coefficient: null, body_shape: null,
    notes: '', make: null, model: null, year: null, tire_label: null,
    power_hp_factory: null, transmission: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', synced_at: null,
  };
}

function renderWizard(source: FakeSpeedSource) {
  return render(
    <ToastProvider>
      <SpeedSourceContext.Provider value={() => source}>
        <MemoryRouter initialEntries={['/vehicles/v1/calibrations/new']}>
          <Routes>
            <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
          </Routes>
        </MemoryRouter>
      </SpeedSourceContext.Provider>
    </ToastProvider>,
  );
}

describe('hands-free calibration', () => {
  beforeEach(() => {
    getVehicle.mockReset();
  });
  afterEach(() => cleanup());

  it('defaults a motorcycle to the hands-free capture', async () => {
    getVehicle.mockResolvedValue(vehicle('motorcycle'));
    renderWizard(new FakeSpeedSource());
    const handsFree = await screen.findByRole('tab', { name: /hands-free/i });
    expect(handsFree).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /on screen/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('defaults a car to the on-screen capture', async () => {
    getVehicle.mockResolvedValue(vehicle('car'));
    renderWizard(new FakeSpeedSource());
    const onScreen = await screen.findByRole('tab', { name: /on screen/i });
    expect(onScreen).toHaveAttribute('aria-selected', 'true');
  });

  // The gear step seeds its toggle with useState, which only reads its initial
  // value once, so mounting before the vehicle resolves would silently pin
  // every vehicle to the tap default.
  it('waits for the vehicle before offering the mode toggle', async () => {
    let resolve: ((v: Vehicle) => void) | undefined;
    getVehicle.mockReturnValue(new Promise<Vehicle | null>((r) => { resolve = r as (v: Vehicle | null) => void; }));
    renderWizard(new FakeSpeedSource());
    expect(screen.getByText(/Loading vehicle/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /hands-free/i })).toBeNull();
    resolve!(vehicle('motorcycle'));
    const handsFree = await screen.findByRole('tab', { name: /hands-free/i });
    expect(handsFree).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the on-screen capture when the vehicle cannot be loaded', async () => {
    getVehicle.mockRejectedValue(new Error('offline'));
    renderWizard(new FakeSpeedSource());
    const onScreen = await screen.findByRole('tab', { name: /on screen/i });
    expect(onScreen).toHaveAttribute('aria-selected', 'true');
  });

  it('reaches the hands-free panel and gates start on a GPS lock', async () => {
    getVehicle.mockResolvedValue(vehicle('motorcycle'));
    const source = new FakeSpeedSource();
    renderWizard(source);

    await screen.findByRole('tab', { name: /hands-free/i });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // The panel warms the sensor up on mount, before anything is recorded.
    await waitFor(() => expect(source.started).toBe(1));

    const start = await screen.findByRole('button', { name: /Start recording/i });
    expect(start).toBeDisabled();
    expect(screen.getByText(/put the phone away/i)).toBeInTheDocument();
    // The promise this flow rests on: a wrong-gear cruise cannot spoil it.
    expect(screen.getByText(/Nothing is captured while you ride/i)).toBeInTheDocument();
  });

  it('keeps the on-screen capture reachable for a motorcycle', async () => {
    getVehicle.mockResolvedValue(vehicle('motorcycle'));
    const source = new FakeSpeedSource();
    renderWizard(source);

    fireEvent.click(await screen.findByRole('tab', { name: /on screen/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // The tap wizard's own instruction card, not the hands-free one.
    expect(await screen.findByText(/Hold steady at/i)).toBeInTheDocument();
    expect(screen.queryByText(/put the phone away/i)).toBeNull();
  });
});
