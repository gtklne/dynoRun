import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { RawTraceCard } from '@/ui/run/raw-trace-card';
import type { RawSpeedSample } from '@/analysis/types';

// Same verbatim fixture as tests/analysis/raw-trace.test.ts: the hands-free
// pull that printed 215 hp from a ~128 hp motorcycle.
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

const CLEAN_RUN: RawSpeedSample[] = Array.from({ length: 80 }, (_, i) => ({
  t_ms: i * 100,
  speed_mps: 10 + 3 * (i * 0.1),
}));

describe('RawTraceCard', () => {
  afterEach(cleanup);

  it('tells the rider why the real 215 hp run cannot be trusted', () => {
    const { getByText, container } = render(<RawTraceCard samples={REAL_RUN} />);

    expect(getByText(/1 fix repeats the previous speed exactly/i)).toBeInTheDocument();
    expect(getByText(/1 step exceeds 12 m\/s²/i)).toBeInTheDocument();

    // The clean-bill message must not appear alongside warnings.
    expect(container.textContent).not.toMatch(/supports this curve/i);
  });

  it('states the 1 Hz ceiling as context, never as a warning', () => {
    // iOS cannot deliver more than about 1 Hz, so every real run trips this.
    // Filing it as a red warning beside the run-specific defects would cry wolf
    // on every run forever and bury the two findings a rider can act on.
    const { getByText, container } = render(<RawTraceCard samples={REAL_RUN} />);

    const note = getByText(/Phone GPS tops out near one fix per second/i);
    expect(note).toBeInTheDocument();
    expect(note).toHaveClass('text-zinc-500');
    expect(note.textContent).toMatch(/That is the ceiling, not a fault/i);
    expect(note.textContent).toMatch(/this whole run is 12 readings/i);

    // It must not be one of the "!" bullets.
    const bullets = [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(bullets).toHaveLength(2);
    expect(bullets.join(' ')).not.toMatch(/tops out near one fix/i);
  });

  it('shows the headline stats with the bad ones called out', () => {
    const { getByText } = render(<RawTraceCard samples={REAL_RUN} />);

    // The fix rate is a platform constant, so it is never painted as a fault.
    const rate = getByText('Fix rate').parentElement!;
    expect(within(rate).getByText('1.0 Hz')).toHaveClass('text-zinc-100');
    expect(within(rate).getByText('platform ceiling')).toBeInTheDocument();

    const repeated = getByText('Repeated').parentElement!;
    expect(within(repeated).getByText('1')).toHaveClass('text-red-400');

    const step = getByText('Peak step').parentElement!;
    expect(within(step).getByText('13.2 m/s²')).toHaveClass('text-red-400');
    expect(within(step).getByText('1.34 g')).toBeInTheDocument();

    expect(within(getByText('Fixes').parentElement!).getByText('12')).toHaveClass('text-zinc-100');
  });

  it('gives a dense clean run a clean bill of health', () => {
    const { getByText, container } = render(<RawTraceCard samples={CLEAN_RUN} />);
    expect(getByText(/The speed signal supports this curve/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/repeats the previous speed/i);
    expect(container.textContent).not.toMatch(/tops out near one fix/i);
  });

  it('does not bless the peak of a clean run that is only 1 Hz', () => {
    const cleanButCoarse: RawSpeedSample[] = Array.from({ length: 12 }, (_, i) => ({
      t_ms: i * 1000,
      speed_mps: 10 + 2.5 * i,
    }));
    const { getByText, container } = render(<RawTraceCard samples={cleanButCoarse} />);
    expect(getByText(/the peak is still a coarse read/i)).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(getByText(/Phone GPS tops out near one fix per second/i)).toBeInTheDocument();
  });

  it('says how much of the run the pipeline threw away at the trim', () => {
    const withCoast: RawSpeedSample[] = [
      ...CLEAN_RUN,
      { t_ms: 8000, speed_mps: 30 },
      { t_ms: 8100, speed_mps: 24 },
      { t_ms: 8200, speed_mps: 18 },
    ];
    const { getByText } = render(<RawTraceCard samples={withCoast} />);
    expect(getByText(/the 3 after it were recorded but never analysed/i)).toBeInTheDocument();
  });

  it('mounts the chart without a plot when there is nothing to difference', () => {
    const { getByText } = render(<RawTraceCard samples={[{ t_ms: 0, speed_mps: 10 }]} />);
    expect(getByText('Not enough fixes to plot.')).toBeInTheDocument();
  });
});
