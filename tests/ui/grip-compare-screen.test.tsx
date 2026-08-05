import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';
import { packGripData } from '@/analysis/grip/storage';
import type { GripSessionFull, GripSessionSummary } from '@/api/repositories/types';
import { BASE_PACE, circuitCsv, simulateSession, type LapPace } from '../analysis/grip/synthetic-circuit';

const listSessions = vi.fn<() => Promise<GripSessionSummary[]>>();
const getSession = vi.fn<(id: string) => Promise<GripSessionFull | null>>();

vi.mock('@/api/repositories/grip-session-repository', () => ({
  gripSessionRepository: {
    list: () => listSessions(),
    get: (id: string) => getSession(id),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { GripCompareScreen } from '@/ui/grip/grip-compare-screen';
import { clearGripSessionCache } from '@/ui/grip/grip-session-cache';

const SLOW: LapPace = { aLat: 0.78, aAcc: 0.42, aBrk: 0.72, vMax: 53 };

function makeSession(
  id: string,
  paces: LapPace[],
  over: Partial<GripSessionFull> = {},
  scale = 1,
): GripSessionFull {
  const sim = simulateSession(paces, 1);
  const parsed = parseRaceboxCsv(circuitCsv(sim));
  if (scale !== 1) {
    for (let i = 0; i < parsed.n; i++) {
      parsed.ch.lat[i] = 47.5 + (parsed.ch.lat[i] - 47.5) * scale;
      parsed.ch.lon[i] = 7.5 + (parsed.ch.lon[i] - 7.5) * scale;
    }
  }
  const data = packGripData(parsed);
  return {
    id,
    vehicle_id: null,
    label: `Session ${id}`,
    track: 'Synthetic Ring',
    config: 'Closed',
    session_date: '2026-08-01',
    best_lap_s: Math.min(...sim.lapTimes),
    lap_count: paces.length,
    sample_count: data.ch.t.length,
    duration_s: data.ch.t[data.ch.t.length - 1],
    settings: null,
    data,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...over,
  };
}

const summaryOf = (s: GripSessionFull): GripSessionSummary => {
  const { settings: _s, data: _d, ...rest } = s;
  return rest;
};

async function renderScreen(entry = '/grip/compare') {
  const result = render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/grip/compare" element={<GripCompareScreen />} />
        <Route path="/grip" element={<div data-testid="grip-home" />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.queryByText(/Pick at least one lap/)).not.toBeInTheDocument());
  return result;
}

describe('GripCompareScreen', () => {
  beforeEach(() => {
    listSessions.mockReset();
    getSession.mockReset();
    // the session cache is module-level and keyed on id + updated_at, which
    // these fixtures deliberately share
    clearGripSessionCache();
  });

  it('opens on the newest session and compares its two fastest laps', async () => {
    const s = makeSession('s1', [BASE_PACE, SLOW, BASE_PACE]);
    listSessions.mockResolvedValue([summaryOf(s)]);
    getSession.mockResolvedValue(s);

    await renderScreen();

    expect(screen.getByRole('heading', { name: 'Compare laps' })).toBeInTheDocument();
    expect(screen.getByText('Where the time went')).toBeInTheDocument();
    // three laps offered, two preselected (the fastest pair)
    expect(screen.getByRole('button', { name: /^Lap 1,/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Lap 2,/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /^Lap 3,/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Laps (2/6)')).toBeInTheDocument();
    cleanup();
  });

  it('shows the turn table with a verdict per turn', async () => {
    const s = makeSession('s1', [BASE_PACE, SLOW]);
    listSessions.mockResolvedValue([summaryOf(s)]);
    getSession.mockResolvedValue(s);

    await renderScreen();

    expect(screen.getByRole('heading', { name: 'Turn by turn' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    // the closed circuit has four detectable turns
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(4);
    expect(within(table).getByText('What happened')).toBeInTheDocument();
    // the slower lap gave up demand, so at least one turn reads as backed off
    expect(within(table).getAllByText(/Slower|Faster|Matched/).length).toBeGreaterThan(0);
    cleanup();
  });

  it('reports the joined-up best of the selected laps', async () => {
    const s = makeSession('s1', [BASE_PACE, SLOW]);
    listSessions.mockResolvedValue([summaryOf(s)]);
    getSession.mockResolvedValue(s);

    await renderScreen();
    expect(screen.getByText(/Best of these laps, joined up/)).toBeInTheDocument();
    cleanup();
  });

  it('lets the reference lap be changed', async () => {
    const s = makeSession('s1', [BASE_PACE, SLOW]);
    listSessions.mockResolvedValue([summaryOf(s)]);
    getSession.mockResolvedValue(s);

    await renderScreen();
    const select = screen.getByLabelText('Reference lap') as HTMLSelectElement;
    // the fastest lap is the default reference
    expect(select.value).toBe('s1:1');
    fireEvent.change(select, { target: { value: 's1:2' } });
    await waitFor(() => expect((screen.getByLabelText('Reference lap') as HTMLSelectElement).value).toBe('s1:2'));
    cleanup();
  });

  it('switches the metric mode', async () => {
    const s = makeSession('s1', [BASE_PACE, SLOW]);
    listSessions.mockResolvedValue([summaryOf(s)]);
    getSession.mockResolvedValue(s);

    await renderScreen();
    fireEvent.click(screen.getByRole('tab', { name: /^Grip$/i }));
    fireEvent.click(screen.getByRole('tab', { name: /^Demand$/i }));
    expect(screen.getByText(/grip score in points/i)).toBeInTheDocument();
    cleanup();
  });

  it('refuses to align a session that is not the same layout, and offers pace instead', async () => {
    const a = makeSession('s1', [BASE_PACE, BASE_PACE]);
    const b = makeSession('s2', [BASE_PACE, BASE_PACE], { label: 'Session s2' }, 1.3);
    listSessions.mockResolvedValue([summaryOf(a), summaryOf(b)]);
    getSession.mockImplementation(async (id) => (id === 's1' ? a : b));

    await renderScreen('/grip/compare?sessions=s1,s2');

    await waitFor(() =>
      expect(screen.getByText(/is not the same layout as the reference/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Comparable on pace only/)).toBeInTheDocument();
    cleanup();
  });

  it('discloses when the two sessions were tuned differently', async () => {
    const a = makeSession('s1', [BASE_PACE, BASE_PACE], {
      settings: { ...DEFAULT_GRIP_SETTINGS, speedSmooth: 5 },
    });
    const b = makeSession('s2', [BASE_PACE, BASE_PACE], {
      label: 'Session s2',
      settings: { ...DEFAULT_GRIP_SETTINGS, speedSmooth: 15 },
    });
    listSessions.mockResolvedValue([summaryOf(a), summaryOf(b)]);
    getSession.mockImplementation(async (id) => (id === 's1' ? a : b));

    await renderScreen('/grip/compare?sessions=s1,s2');

    await waitFor(() => expect(screen.getByText(/tuned differently/)).toBeInTheDocument());
    expect(screen.getByText('speedSmooth')).toBeInTheDocument();
    cleanup();
  });

  it('caps the selection and blocks further laps', async () => {
    const s = makeSession('s1', Array.from({ length: 8 }, () => BASE_PACE));
    listSessions.mockResolvedValue([summaryOf(s)]);
    getSession.mockResolvedValue(s);

    await renderScreen();
    // laps 1 and 2 are preselected as the fastest pair; add four more
    for (const n of [3, 4, 5, 6]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Lap ${n},`) }));
    }
    await waitFor(() => expect(screen.getByText('Laps (6/6)')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^Lap 7,/ })).toBeDisabled();
    cleanup();
  });

  it('shows an empty state when the library has no sessions', async () => {
    listSessions.mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/grip/compare']}>
        <Routes>
          <Route path="/grip/compare" element={<GripCompareScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Add a session above to start comparing laps/)).toBeInTheDocument(),
    );
    cleanup();
  });
});
