import { afterEach, describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PeakTrendChart, type PeakTrendRun } from '@/ui/components/peak-trend-chart';
import { UnitsProvider } from '@/app/units-context';

const ORIGINAL_INNER_WIDTH = window.innerWidth;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function makeRun(overrides: Partial<PeakTrendRun> & { id: string }): PeakTrendRun {
  return {
    started_at: '2026-01-01T10:00:00.000Z',
    peak_power_kw: 100,
    status: 'complete',
    title: null,
    gear_label: '4th',
    ...overrides,
  };
}

function renderChart(runs: PeakTrendRun[]) {
  return render(
    <UnitsProvider>
      <PeakTrendChart runs={runs} />
    </UnitsProvider>,
  );
}

describe('PeakTrendChart', () => {
  afterEach(() => setViewportWidth(ORIGINAL_INNER_WIDTH));

  it('renders empty state with no runs', () => {
    const { getByText } = renderChart([]);
    expect(getByText(/Not enough complete runs/i)).toBeInTheDocument();
    cleanup();
  });

  it('renders empty state with a single valid run', () => {
    const runs = [makeRun({ id: '1' })];
    const { getByText, queryByTestId } = renderChart(runs);
    expect(getByText(/Not enough complete runs/i)).toBeInTheDocument();
    expect(queryByTestId('peak-trend-chart')).toBeNull();
    cleanup();
  });

  it('renders empty state when no runs are status=complete', () => {
    const runs = [
      makeRun({ id: '1', status: 'aborted' }),
      makeRun({ id: '2', status: 'in_progress' }),
      makeRun({ id: '3', status: 'degraded' }),
    ];
    const { getByText } = renderChart(runs);
    expect(getByText(/Not enough complete runs/i)).toBeInTheDocument();
    cleanup();
  });

  it('renders empty state when all complete runs have null peak_power_kw', () => {
    const runs = [
      makeRun({ id: '1', peak_power_kw: null }),
      makeRun({ id: '2', peak_power_kw: null }),
    ];
    const { getByText } = renderChart(runs);
    expect(getByText(/Not enough complete runs/i)).toBeInTheDocument();
    cleanup();
  });

  it('renders chart container when given 2+ valid runs', () => {
    const runs = [
      makeRun({ id: '1', started_at: '2026-01-01T10:00:00.000Z', peak_power_kw: 100 }),
      makeRun({ id: '2', started_at: '2026-01-02T10:00:00.000Z', peak_power_kw: 110 }),
    ];
    const { getByTestId } = renderChart(runs);
    expect(getByTestId('peak-trend-chart')).toBeInTheDocument();
    cleanup();
  });

  it('does not crash with mixed-status data', () => {
    const runs = [
      makeRun({ id: '1', status: 'complete', peak_power_kw: 100 }),
      makeRun({ id: '2', status: 'aborted', peak_power_kw: null }),
      makeRun({ id: '3', status: 'in_progress', peak_power_kw: null }),
      makeRun({ id: '4', status: 'complete', peak_power_kw: 120 }),
      makeRun({ id: '5', status: 'complete', peak_power_kw: null }),
      makeRun({ id: '6', status: 'degraded', peak_power_kw: 90 }),
    ];
    const { getByTestId } = renderChart(runs);
    expect(getByTestId('peak-trend-chart')).toBeInTheDocument();
    cleanup();
  });

  it('does not crash when onSelectRun is provided', () => {
    const runs = [
      makeRun({ id: '1', started_at: '2026-01-01T10:00:00.000Z', peak_power_kw: 100 }),
      makeRun({ id: '2', started_at: '2026-01-02T10:00:00.000Z', peak_power_kw: 110 }),
    ];
    const { getByTestId } = render(
      <UnitsProvider>
        <PeakTrendChart runs={runs} onSelectRun={() => {}} />
      </UnitsProvider>,
    );
    expect(getByTestId('peak-trend-chart')).toBeInTheDocument();
    cleanup();
  });

  it('ignores runs with invalid started_at', () => {
    const runs = [
      makeRun({ id: '1', started_at: 'not-a-date', peak_power_kw: 100 }),
      makeRun({ id: '2', started_at: '2026-01-02T10:00:00.000Z', peak_power_kw: 110 }),
    ];
    const { getByText } = renderChart(runs);
    expect(getByText(/Not enough complete runs/i)).toBeInTheDocument();
    cleanup();
  });

  it('renders at a narrow mobile viewport without crashing', () => {
    setViewportWidth(360);
    const runs = [
      makeRun({ id: '1', started_at: '2026-01-01T10:00:00.000Z', peak_power_kw: 100 }),
      makeRun({ id: '2', started_at: '2026-01-02T10:00:00.000Z', peak_power_kw: 110 }),
    ];
    const { getByTestId } = renderChart(runs);
    expect(getByTestId('peak-trend-chart')).toBeInTheDocument();
    cleanup();
  });
});
