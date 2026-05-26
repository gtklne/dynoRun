import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

import { AllRunsScreen } from '@/ui/runs/all-runs-screen';
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
      <MemoryRouter>
        <AllRunsScreen />
      </MemoryRouter>
    </UnitsProvider>,
  );
  await waitFor(() => {
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
  });
  return result;
}

describe('AllRunsScreen', () => {
  beforeEach(() => {
    listVehicles.mockReset();
    listRunsByVehicle.mockReset();
  });

  it('renders empty state with go-to-garage link when no runs', async () => {
    setupData([], {});
    await renderScreen();

    expect(screen.getByText('Start your first run')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Go to garage/i });
    expect(link).toHaveAttribute('href', '/garage');
    expect(screen.queryByRole('tablist', { name: /Filter by vehicle/i })).not.toBeInTheDocument();
    cleanup();
  });

  it('hides filter UI when fewer than 5 runs exist', async () => {
    const v = makeVehicle({ id: 'v1', name: 'Civic' });
    const runs = [
      makeRun({ id: 'r1', vehicle_id: 'v1', title: 'Morning' }),
      makeRun({ id: 'r2', vehicle_id: 'v1', title: 'Evening' }),
    ];
    setupData([v], { v1: runs });
    await renderScreen();

    expect(screen.queryByRole('tablist', { name: /Filter by vehicle/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Search runs by title/i)).not.toBeInTheDocument();
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('Evening')).toBeInTheDocument();
    cleanup();
  });

  it('shows vehicle filter chips when runs span multiple vehicles', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const v2 = makeVehicle({ id: 'v2', name: 'Miata' });
    const runs1 = [
      makeRun({ id: 'r1', vehicle_id: 'v1', title: 'Civic A' }),
      makeRun({ id: 'r2', vehicle_id: 'v1', title: 'Civic B' }),
      makeRun({ id: 'r3', vehicle_id: 'v1', title: 'Civic C' }),
    ];
    const runs2 = [
      makeRun({ id: 'r4', vehicle_id: 'v2', title: 'Miata A' }),
      makeRun({ id: 'r5', vehicle_id: 'v2', title: 'Miata B' }),
    ];
    setupData([v1, v2], { v1: runs1, v2: runs2 });
    await renderScreen();

    const tablist = screen.getByRole('tablist', { name: /Filter by vehicle/i });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All\s*·\s*5/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Civic\s*·\s*3/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Miata\s*·\s*2/i })).toBeInTheDocument();
    cleanup();
  });

  it('filters list when a vehicle chip is clicked', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const v2 = makeVehicle({ id: 'v2', name: 'Miata' });
    const runs1 = [
      makeRun({ id: 'r1', vehicle_id: 'v1', title: 'Civic Alpha' }),
      makeRun({ id: 'r2', vehicle_id: 'v1', title: 'Civic Bravo' }),
      makeRun({ id: 'r3', vehicle_id: 'v1', title: 'Civic Charlie' }),
    ];
    const runs2 = [
      makeRun({ id: 'r4', vehicle_id: 'v2', title: 'Miata Alpha' }),
      makeRun({ id: 'r5', vehicle_id: 'v2', title: 'Miata Bravo' }),
    ];
    setupData([v1, v2], { v1: runs1, v2: runs2 });
    await renderScreen();

    expect(screen.getByText('Civic Alpha')).toBeInTheDocument();
    expect(screen.getByText('Miata Alpha')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: /Miata\s*·\s*2/i }));
    });

    expect(screen.queryByText('Civic Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Civic Bravo')).not.toBeInTheDocument();
    expect(screen.queryByText('Civic Charlie')).not.toBeInTheDocument();
    expect(screen.getByText('Miata Alpha')).toBeInTheDocument();
    expect(screen.getByText('Miata Bravo')).toBeInTheDocument();
    cleanup();
  });

  it('filters by case-insensitive title substring', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const runs = [
      makeRun({ id: 'r1', vehicle_id: 'v1', title: 'Cold morning' }),
      makeRun({ id: 'r2', vehicle_id: 'v1', title: 'Hot afternoon' }),
      makeRun({ id: 'r3', vehicle_id: 'v1', title: 'Cool evening' }),
      makeRun({ id: 'r4', vehicle_id: 'v1', title: 'Warm midday' }),
      makeRun({ id: 'r5', vehicle_id: 'v1', title: 'Foggy dawn' }),
    ];
    setupData([v1], { v1: runs });
    await renderScreen();

    const search = screen.getByLabelText(/Search runs by title/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'COLD' } });
    });

    expect(screen.getByText('Cold morning')).toBeInTheDocument();
    expect(screen.queryByText('Hot afternoon')).not.toBeInTheDocument();
    expect(screen.queryByText('Cool evening')).not.toBeInTheDocument();

    const clearBtn = screen.getByLabelText(/Clear search/i);
    act(() => {
      fireEvent.click(clearBtn);
    });

    expect(screen.getByText('Cold morning')).toBeInTheDocument();
    expect(screen.getByText('Hot afternoon')).toBeInTheDocument();
    cleanup();
  });

  it('shows the no-results state when filters match nothing', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const runs = Array.from({ length: 5 }, (_, i) =>
      makeRun({ id: `r${i}`, vehicle_id: 'v1', title: `Run ${i}` }),
    );
    setupData([v1], { v1: runs });
    await renderScreen();

    const search = screen.getByLabelText(/Search runs by title/i) as HTMLInputElement;
    act(() => {
      fireEvent.change(search, { target: { value: 'zzzz-no-match' } });
    });

    expect(screen.getByText('No runs match your filters')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
    });

    expect(screen.queryByText('No runs match your filters')).not.toBeInTheDocument();
    expect(screen.getByText('Run 0')).toBeInTheDocument();
    cleanup();
  });

  it('sorts by highest peak when selected', async () => {
    const v1 = makeVehicle({ id: 'v1', name: 'Civic' });
    const runs = [
      makeRun({ id: 'r1', vehicle_id: 'v1', title: 'Run 1', peak_power_kw: 80, started_at: '2026-01-05T10:00:00.000Z' }),
      makeRun({ id: 'r2', vehicle_id: 'v1', title: 'Run 2', peak_power_kw: 150, started_at: '2026-01-04T10:00:00.000Z' }),
      makeRun({ id: 'r3', vehicle_id: 'v1', title: 'Run 3', peak_power_kw: 110, started_at: '2026-01-03T10:00:00.000Z' }),
      makeRun({ id: 'r4', vehicle_id: 'v1', title: 'Run 4', peak_power_kw: null, started_at: '2026-01-02T10:00:00.000Z' }),
      makeRun({ id: 'r5', vehicle_id: 'v1', title: 'Run 5', peak_power_kw: 95, started_at: '2026-01-01T10:00:00.000Z' }),
    ];
    setupData([v1], { v1: runs });
    await renderScreen();

    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: /Highest peak/i }));
    });

    const titles = screen.getAllByText(/^Run \d+$/).map((el) => el.textContent);
    expect(titles).toEqual(['Run 2', 'Run 3', 'Run 5', 'Run 1', 'Run 4']);
    cleanup();
  });
});
