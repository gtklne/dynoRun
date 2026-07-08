import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { GripSessionSummary, NewGripSession } from '@/api/repositories/types';
import { syntheticCsv } from '../analysis/grip/synthetic';

const listSessions = vi.fn<() => Promise<GripSessionSummary[]>>();
const createSession = vi.fn<(input: NewGripSession) => Promise<GripSessionSummary>>();
const deleteSession = vi.fn<(id: string) => Promise<void>>();

vi.mock('@/api/repositories/grip-session-repository', () => ({
  gripSessionRepository: {
    list: () => listSessions(),
    get: vi.fn(),
    create: (input: NewGripSession) => createSession(input),
    update: vi.fn(),
    delete: (id: string) => deleteSession(id),
  },
}));

vi.mock('@/api/repositories/vehicle-repository', () => ({
  vehicleRepository: {
    list: vi.fn().mockResolvedValue([
      { id: 'v1', name: 'R6' },
    ]),
  },
}));

import { GripHome } from '@/ui/grip/grip-home';

function makeSummary(overrides: Partial<GripSessionSummary> & { id: string }): GripSessionSummary {
  return {
    vehicle_id: null,
    label: null,
    track: 'Testring',
    config: 'GP',
    session_date: '2026-07-08',
    best_lap_s: 95.42,
    lap_count: 8,
    sample_count: 42000,
    duration_s: 1680,
    created_at: '2026-07-08T10:00:00.000Z',
    updated_at: '2026-07-08T10:00:00.000Z',
    ...overrides,
  };
}

async function renderScreen() {
  const result = render(
    <MemoryRouter initialEntries={['/grip']}>
      <Routes>
        <Route path="/grip" element={<GripHome />} />
        <Route path="/grip/sessions/:sessionId" element={<div data-testid="session-screen" />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(screen.queryByText(/^Loading…$/)).not.toBeInTheDocument();
  });
  return result;
}

describe('GripHome', () => {
  beforeEach(() => {
    listSessions.mockReset();
    createSession.mockReset();
    deleteSession.mockReset();
  });

  it('shows the empty state when no sessions exist', async () => {
    listSessions.mockResolvedValue([]);
    await renderScreen();
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
    cleanup();
  });

  it('lists saved sessions with track, laps, best lap and vehicle chip', async () => {
    listSessions.mockResolvedValue([
      makeSummary({ id: 's1', vehicle_id: 'v1' }),
      makeSummary({ id: 's2', track: 'Otherring', label: 'Rain day', best_lap_s: 61.2, lap_count: 3 }),
    ]);
    await renderScreen();

    expect(screen.getByText('Testring')).toBeInTheDocument();
    expect(screen.getByText('Rain day')).toBeInTheDocument();
    expect(screen.getByText(/8 laps/)).toBeInTheDocument();
    expect(screen.getByText(/best 1:35\.42/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('R6')).toBeInTheDocument());
    cleanup();
  });

  it('parses an uploaded CSV, saves it, and navigates to the session', async () => {
    listSessions.mockResolvedValue([]);
    createSession.mockResolvedValue(makeSummary({ id: 's-new' }));
    const { container } = await renderScreen();

    const input = container.querySelector('input[type=file]')!;
    const file = new File([syntheticCsv()], 'session.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByTestId('session-screen')).toBeInTheDocument());
    const sent = createSession.mock.calls[0][0];
    expect(sent.data.version).toBe(1);
    expect(sent.data.meta.track).toBe('Testring');
    expect(sent.data.ch.t.length).toBeGreaterThan(1000);
    cleanup();
  });

  it('surfaces parse errors without saving', async () => {
    listSessions.mockResolvedValue([]);
    const { container } = await renderScreen();

    const input = container.querySelector('input[type=file]')!;
    const file = new File(['not,a,racebox,file'], 'junk.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Record/)).toBeInTheDocument());
    expect(createSession).not.toHaveBeenCalled();
    cleanup();
  });

  it('deletes a session after confirmation', async () => {
    listSessions.mockResolvedValue([makeSummary({ id: 's1' })]);
    deleteSession.mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    await waitFor(() => expect(deleteSession).toHaveBeenCalledWith('s1'));
    cleanup();
  });
});
