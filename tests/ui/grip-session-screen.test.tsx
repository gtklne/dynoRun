import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { packGripData } from '@/analysis/grip/storage';
import type { GripSessionFull, GripSessionPatch } from '@/api/repositories/types';
import { syntheticCsv } from '../analysis/grip/synthetic';

const getSession = vi.fn<(id: string) => Promise<GripSessionFull | null>>();
const updateSession = vi.fn<(id: string, patch: GripSessionPatch) => Promise<void>>();

vi.mock('@/api/repositories/grip-session-repository', () => ({
  gripSessionRepository: {
    list: vi.fn(),
    get: (id: string) => getSession(id),
    create: vi.fn(),
    update: (id: string, patch: GripSessionPatch) => updateSession(id, patch),
    delete: vi.fn(),
  },
}));

vi.mock('@/api/repositories/vehicle-repository', () => ({
  vehicleRepository: {
    list: vi.fn().mockResolvedValue([
      { id: 'v1', name: 'R6' },
      { id: 'v2', name: 'Tuono' },
    ]),
  },
}));

import { GripSessionScreen } from '@/ui/grip/grip-session-screen';

function makeFull(): GripSessionFull {
  const data = packGripData(parseRaceboxCsv(syntheticCsv()));
  return {
    id: 's1',
    vehicle_id: null,
    label: null,
    track: 'Testring',
    config: 'GP',
    session_date: '2026-07-08',
    best_lap_s: 39.5,
    lap_count: 2,
    sample_count: data.ch.t.length,
    duration_s: data.ch.t[data.ch.t.length - 1],
    settings: null,
    data,
    created_at: '2026-07-08T10:00:00.000Z',
    updated_at: '2026-07-08T10:00:00.000Z',
  };
}

async function renderScreen() {
  const result = render(
    <MemoryRouter initialEntries={['/grip/sessions/s1']}>
      <Routes>
        <Route path="/grip/sessions/:sessionId" element={<GripSessionScreen />} />
        <Route path="/grip" element={<div data-testid="grip-home" />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.queryByText(/Loading session…/)).not.toBeInTheDocument();
  });
  return result;
}

describe('GripSessionScreen', () => {
  beforeEach(() => {
    getSession.mockReset();
    updateSession.mockReset();
  });

  it('analyzes the stored session and renders lap tabs, corners, and telemetry', async () => {
    getSession.mockResolvedValue(makeFull());
    await renderScreen();

    // best lap (Lap 1 per metadata) is preselected, both laps offered
    expect(screen.getByText('Lap 1 ★')).toBeInTheDocument();
    expect(screen.getByText('Lap 2')).toBeInTheDocument();
    // two synthetic corners
    expect(screen.getByText(/Turn 1 · Left/i)).toBeInTheDocument();
    expect(screen.getByText(/Turn 2 · Right/i)).toBeInTheDocument();
    // dynamic-load metric is the default colouring
    expect(screen.getByText(/Track map — dynamic load/i)).toBeInTheDocument();
    cleanup();
  });

  it('shows a not-found state for a missing session', async () => {
    getSession.mockResolvedValue(null);
    render(
      <MemoryRouter initialEntries={['/grip/sessions/s1']}>
        <Routes>
          <Route path="/grip/sessions/:sessionId" element={<GripSessionScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Session not found/i)).toBeInTheDocument());
    cleanup();
  });

  it('switches the metric mode', async () => {
    getSession.mockResolvedValue(makeFull());
    await renderScreen();

    fireEvent.click(screen.getByRole('tab', { name: /^Grip$/i }));
    expect(screen.getByText(/Track map — grip score/i)).toBeInTheDocument();
    cleanup();
  });

  it('persists a vehicle link', async () => {
    getSession.mockResolvedValue(makeFull());
    updateSession.mockResolvedValue();
    await renderScreen();

    const select = await screen.findByLabelText('Linked vehicle');
    fireEvent.change(select, { target: { value: 'v2' } });
    await waitFor(() => expect(updateSession).toHaveBeenCalledWith('s1', { vehicle_id: 'v2' }));
    cleanup();
  });

  it('persists tuned settings, debounced', async () => {
    vi.useFakeTimers();
    try {
      getSession.mockResolvedValue(makeFull());
      updateSession.mockResolvedValue();
      render(
        <MemoryRouter initialEntries={['/grip/sessions/s1']}>
          <Routes>
            <Route path="/grip/sessions/:sessionId" element={<GripSessionScreen />} />
          </Routes>
        </MemoryRouter>,
      );
      await vi.waitFor(() => {
        expect(screen.queryByText(/Loading session…/)).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Settings'));
      const slider = screen.getByLabelText(/Transient weighting/i, { selector: 'input' });
      fireEvent.change(slider, { target: { value: '0.5' } });

      await vi.advanceTimersByTimeAsync(1000);
      expect(updateSession).toHaveBeenCalledWith('s1', {
        settings: expect.objectContaining({ tau: 0.5 }),
      });
    } finally {
      vi.useRealTimers();
    }
    cleanup();
  });
});
