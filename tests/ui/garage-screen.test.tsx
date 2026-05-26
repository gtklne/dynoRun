import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Run, Vehicle } from '@/shared/types';

const listVehicles = vi.fn<() => Promise<Vehicle[]>>();
const listRunsByVehicle = vi.fn<(id: string) => Promise<Run[]>>();

vi.mock('@/api/repositories/vehicle-repository', () => ({
  vehicleRepository: {
    list: () => listVehicles(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/api/repositories/run-repository', () => ({
  runRepository: {
    listByVehicle: (id: string) => listRunsByVehicle(id),
    create: vi.fn(),
    get: vi.fn(),
    markDegraded: vi.fn(),
    markAborted: vi.fn(),
    markComplete: vi.fn(),
    finalize: vi.fn(),
    updateNotes: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { GarageScreen } from '@/ui/garage/garage-screen';
import { UnitsProvider } from '@/app/units-context';

function makeVehicle(overrides: Partial<Vehicle> & { id: string; name: string }): Vehicle {
  return {
    user_id: null,
    kind: 'car',
    mass_kg: 1500,
    drivetrain: 'rwd',
    frontal_area_m2: null,
    drag_coefficient: null,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    synced_at: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<Run> & { id: string; vehicle_id: string }): Run {
  return {
    user_id: null,
    calibration_id: 'cal-1',
    started_at: '2026-01-01T10:00:00.000Z',
    ended_at: '2026-01-01T10:00:30.000Z',
    gear_label: '4th',
    conditions: {},
    notes: '',
    status: 'complete',
    title: null,
    peak_power_kw: 100,
    peak_torque_nm: 200,
    peak_power_rpm: 5000,
    share_token: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:30.000Z',
    synced_at: null,
    ...overrides,
  };
}

function setupData(vehicles: Vehicle[], runsByVehicle: Record<string, Run[]>) {
  listVehicles.mockResolvedValue(vehicles);
  listRunsByVehicle.mockImplementation(async (id: string) => runsByVehicle[id] ?? []);
}

async function renderScreen() {
  const result = render(
    <UnitsProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<GarageScreen />} />
          <Route path="/runs/:id/review" element={<div data-testid="run-review">REVIEW</div>} />
        </Routes>
      </MemoryRouter>
    </UnitsProvider>,
  );
  await waitFor(() => {
    expect(screen.queryByText(/^Loading…$/)).not.toBeInTheDocument();
  });
  return result;
}

describe('GarageScreen', () => {
  beforeEach(() => {
    listVehicles.mockReset();
    listRunsByVehicle.mockReset();
  });

  it('renders OnboardingCard when no vehicles exist', async () => {
    setupData([], {});
    await renderScreen();

    expect(screen.getByText(/How it works/i)).toBeInTheDocument();
    expect(screen.getByText(/Add your vehicle/i)).toBeInTheDocument();
    expect(screen.getByText(/No vehicles yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/All-time peak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recent activity/i)).not.toBeInTheDocument();
    cleanup();
  });

  it('renders hero stats when at least one complete run exists', async () => {
    const v = makeVehicle({ id: 'v1', name: 'Civic' });
    setupData([v], {
      v1: [makeRun({ id: 'r1', vehicle_id: 'v1', peak_power_kw: 123 })],
    });
    await renderScreen();

    expect(screen.getByText(/All-time peak/i)).toBeInTheDocument();
    expect(screen.getByText(/Total runs/i)).toBeInTheDocument();
    expect(screen.getByText(/^Cars$/i)).toBeInTheDocument();
    expect(screen.getByText(/in garage/i)).toBeInTheDocument();

    const peakValues = screen.getAllByText(/123\.0 kW/);
    expect(peakValues.length).toBeGreaterThan(0);
    cleanup();
  });

  it('shows the vehicle name as the peak subtitle', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const v2 = makeVehicle({ id: 'v2', name: 'Miata' });
    setupData([v1, v2], {
      v1: [makeRun({ id: 'r1', vehicle_id: 'v1', peak_power_kw: 100 })],
      v2: [makeRun({ id: 'r2', vehicle_id: 'v2', peak_power_kw: 200 })],
    });
    await renderScreen();

    const peakTile = screen.getByText(/All-time peak/i).closest('div');
    expect(peakTile?.textContent).toMatch(/Miata/);
    cleanup();
  });

  it('hides hero stats and recent feed when there are zero complete runs', async () => {
    const v = makeVehicle({ id: 'v1', name: 'Civic' });
    setupData([v], {
      v1: [
        makeRun({ id: 'r1', vehicle_id: 'v1', status: 'aborted', peak_power_kw: null }),
        makeRun({ id: 'r2', vehicle_id: 'v1', status: 'in_progress', peak_power_kw: null }),
      ],
    });
    await renderScreen();

    expect(screen.queryByText(/All-time peak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total runs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recent activity/i)).not.toBeInTheDocument();

    expect(screen.getByText('Civic')).toBeInTheDocument();
    cleanup();
  });

  it('shows recent runs sorted newest first across vehicles', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const v2 = makeVehicle({ id: 'v2', name: 'Miata' });
    setupData([v1, v2], {
      v1: [
        makeRun({ id: 'r1', vehicle_id: 'v1', title: 'Civic Old', started_at: '2026-01-01T10:00:00.000Z' }),
        makeRun({ id: 'r2', vehicle_id: 'v1', title: 'Civic New', started_at: '2026-01-10T10:00:00.000Z' }),
      ],
      v2: [
        makeRun({ id: 'r3', vehicle_id: 'v2', title: 'Miata Mid', started_at: '2026-01-05T10:00:00.000Z' }),
      ],
    });
    await renderScreen();

    expect(screen.getByText(/Recent activity/i)).toBeInTheDocument();

    const titles = ['Civic New', 'Miata Mid', 'Civic Old'];
    const found = titles.map((t) => screen.getByText(t));
    for (let i = 1; i < found.length; i++) {
      const cmp = found[i - 1].compareDocumentPosition(found[i]);
      expect(cmp & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    cleanup();
  });

  it('limits the recent feed to 5 rows', async () => {
    const v = makeVehicle({ id: 'v1', name: 'Civic' });
    const runs = Array.from({ length: 8 }, (_, i) =>
      makeRun({
        id: `r${i}`,
        vehicle_id: 'v1',
        title: `Run ${i}`,
        started_at: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      }),
    );
    setupData([v], { v1: runs });
    await renderScreen();

    expect(screen.getByText('Run 7')).toBeInTheDocument();
    expect(screen.getByText('Run 3')).toBeInTheDocument();
    expect(screen.queryByText('Run 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Run 0')).not.toBeInTheDocument();
    cleanup();
  });

  it('navigates to /runs/:id/review when a recent row is clicked', async () => {
    const v = makeVehicle({ id: 'v1', name: 'Civic' });
    setupData([v], {
      v1: [makeRun({ id: 'r-click', vehicle_id: 'v1', title: 'Clickable run' })],
    });
    await renderScreen();

    const row = screen.getByText('Clickable run').closest('a');
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute('href', '/runs/r-click/review');

    fireEvent.click(row!);

    await waitFor(() => {
      expect(screen.getByTestId('run-review')).toBeInTheDocument();
    });
    cleanup();
  });

  it('keeps the vehicle list rendered alongside the dashboard', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const v2 = makeVehicle({ id: 'v2', name: 'Miata' });
    setupData([v1, v2], {
      v1: [makeRun({ id: 'r1', vehicle_id: 'v1', peak_power_kw: 90 })],
      v2: [],
    });
    await renderScreen();

    const civicCard = screen.getByRole('link', { name: /Civic.*car.*1500 kg.*RWD/i });
    expect(civicCard).toHaveAttribute('href', '/vehicles/v1');
    const miataCard = screen.getByRole('link', { name: /Miata.*car.*1500 kg.*RWD/i });
    expect(miataCard).toHaveAttribute('href', '/vehicles/v2');
    expect(screen.getByText(/All-time peak/i)).toBeInTheDocument();
    cleanup();
  });
});
