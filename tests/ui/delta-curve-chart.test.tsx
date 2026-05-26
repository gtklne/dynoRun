import { afterEach, describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DeltaCurveChart } from '@/ui/components/delta-curve-chart';
import type { CurveDeltaPoint } from '@/analysis/curve-delta';

const ORIGINAL_INNER_WIDTH = window.innerWidth;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

function makeDelta(): CurveDeltaPoint[] {
  return [
    { rpm: 2000, delta_power_kw: 5, delta_torque_nm: 12, a_power_kw: 45, b_power_kw: 40 },
    { rpm: 3000, delta_power_kw: 8, delta_torque_nm: 18, a_power_kw: 88, b_power_kw: 80 },
    { rpm: 4000, delta_power_kw: -2, delta_torque_nm: -4, a_power_kw: 108, b_power_kw: 110 },
    { rpm: 5000, delta_power_kw: -6, delta_torque_nm: -10, a_power_kw: 124, b_power_kw: 130 },
  ];
}

describe('DeltaCurveChart', () => {
  afterEach(() => setViewportWidth(ORIGINAL_INNER_WIDTH));

  it('renders empty state when delta is empty', () => {
    const { getByText } = render(<DeltaCurveChart delta={[]} />);
    expect(getByText(/No overlapping RPM range/i)).toBeInTheDocument();
    cleanup();
  });

  it('mounts in power mode without crashing', () => {
    const { container } = render(<DeltaCurveChart delta={makeDelta()} />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('mounts in torque mode without crashing', () => {
    const { container } = render(<DeltaCurveChart delta={makeDelta()} metric="torque" />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('mounts with hp unit conversion', () => {
    const { container } = render(<DeltaCurveChart delta={makeDelta()} unit="hp" />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('renders at a narrow mobile viewport without crashing', () => {
    setViewportWidth(360);
    const { container } = render(
      <DeltaCurveChart delta={makeDelta()} labelA="Stock" labelB="Tuned" />,
    );
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });
});
