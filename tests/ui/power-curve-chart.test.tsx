import { afterEach, describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PowerCurveChart, type CurveSeries } from '@/ui/components/power-curve-chart';
import type { RpmPoint } from '@/shared/types';

function makePoints(): RpmPoint[] {
  return [
    { rpm: 2000, wheel_power_kw: 40, wheel_torque_nm: 190 },
    { rpm: 3000, wheel_power_kw: 80, wheel_torque_nm: 255 },
    { rpm: 4000, wheel_power_kw: 110, wheel_torque_nm: 263 },
    { rpm: 5000, wheel_power_kw: 130, wheel_torque_nm: 248 },
    { rpm: 6000, wheel_power_kw: 120, wheel_torque_nm: 191 },
  ];
}

const series: CurveSeries[] = [{ label: 'A', points: makePoints() }];

const ORIGINAL_INNER_WIDTH = window.innerWidth;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

describe('PowerCurveChart', () => {
  afterEach(() => setViewportWidth(ORIGINAL_INNER_WIDTH));

  it('renders fallback when series is empty', () => {
    const { getByText } = render(<PowerCurveChart series={[]} />);
    expect(getByText('No data.')).toBeInTheDocument();
    cleanup();
  });

  it('mounts with default power mode', () => {
    const { container } = render(<PowerCurveChart series={series} />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('mounts with torque mode', () => {
    const { container } = render(<PowerCurveChart series={series} mode="torque" />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('mounts with both mode', () => {
    const { container } = render(<PowerCurveChart series={series} mode="both" />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('mounts with hp unit conversion', () => {
    const { container } = render(<PowerCurveChart series={series} unit="hp" />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('mounts with highlight label', () => {
    const { container } = render(<PowerCurveChart series={series} highlightLabel="A" />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('mounts with multiple series in both mode', () => {
    const multi: CurveSeries[] = [
      { label: 'A', points: makePoints() },
      { label: 'B', points: makePoints().map((p) => ({ ...p, wheel_power_kw: p.wheel_power_kw * 0.9 })) },
    ];
    const { container } = render(
      <PowerCurveChart series={multi} mode="both" highlightLabel="A" unit="PS" />,
    );
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('renders at a narrow mobile viewport without crashing', () => {
    setViewportWidth(360);
    const { container } = render(<PowerCurveChart series={series} />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('renders at a narrow viewport in both mode without crashing', () => {
    setViewportWidth(360);
    const { container } = render(<PowerCurveChart series={series} mode="both" />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });
});
