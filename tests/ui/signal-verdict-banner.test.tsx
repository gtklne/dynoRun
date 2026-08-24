import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { SignalVerdictBanner } from '@/ui/components/signal-verdict-banner';
import { assessSignal } from '@/analysis/signal-integrity';
import type { RawSpeedSample } from '@/analysis/types';

const REAL_RUN: RawSpeedSample[] = [
  { t_ms: 0, speed_mps: 6.910359 },
  { t_ms: 989, speed_mps: 7.824923 },
  { t_ms: 1982, speed_mps: 8.1315155 },
  { t_ms: 2985, speed_mps: 8.187438 },
  { t_ms: 3980, speed_mps: 8.6754875 },
  { t_ms: 4986, speed_mps: 10.038628 },
  { t_ms: 5981, speed_mps: 11.025276 },
  { t_ms: 6987, speed_mps: 10.768769 },
  { t_ms: 7982, speed_mps: 18.879076 },
  { t_ms: 8986, speed_mps: 18.879074 },
  { t_ms: 9986, speed_mps: 25.850077 },
  { t_ms: 10983, speed_mps: 38.98678 },
];

const CLEAN: RawSpeedSample[] = Array.from({ length: 40 }, (_, i) => ({
  t_ms: i * 100,
  speed_mps: 10 + 3 * (i * 0.1),
}));

describe('SignalVerdictBanner', () => {
  afterEach(cleanup);

  it('tells the rider to ride the corrupt pull again, and lists the faults', () => {
    const { container } = render(<SignalVerdictBanner integrity={assessSignal(REAL_RUN)} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/GPS drift corrupted this pull/i)).toBeInTheDocument();
    expect(screen.getByText(/Discard this one and ride the pull again/i)).toBeInTheDocument();
    expect(screen.getByText(/Speed froze, then caught up/i)).toBeInTheDocument();
    expect(screen.getByText(/Impossible step/i)).toBeInTheDocument();
    // Both faults are inside the measured window, so neither is excused.
    expect(container.textContent).not.toMatch(/outside the measured window/i);
  });

  it('renders the discard action and wires it up', () => {
    const onDiscard = vi.fn();
    render(
      <SignalVerdictBanner
        integrity={assessSignal(REAL_RUN)}
        action={<button onClick={onDiscard}>Discard and ride it again</button>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Discard and ride it again/i }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('stays silent on a clean run rather than showing an all-clear', () => {
    // A green banner on every good run trains riders to skim past the red one.
    const { container } = render(<SignalVerdictBanner integrity={assessSignal(CLEAN)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks a fault that never fed the curve as outside the window', () => {
    const coastFault: RawSpeedSample[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ t_ms: i * 1000, speed_mps: 10 + 3 * i })),
      { t_ms: 8000, speed_mps: 20 },
      { t_ms: 9000, speed_mps: 20 },
      { t_ms: 10000, speed_mps: 28 },
    ];
    const integrity = assessSignal(coastFault);
    expect(integrity.verdict).toBe('suspect');
    render(<SignalVerdictBanner integrity={integrity} />);
    expect(screen.getAllByText(/outside the measured window/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/ride the pull again/i)).not.toBeInTheDocument();
  });
});
