import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ExpertView } from '@/ui/run/expert-view';
import type { RoadLoadSummary } from '@/analysis/types';
import type { PowerBreakdownPoint } from '@/analysis/rpm-bin';

afterEach(() => cleanup());

function roadLoad(overrides: Partial<RoadLoadSummary> = {}): RoadLoadSummary {
  return {
    cd_a_m2: 0.7,
    cd_a_source: 'default',
    crr: 0.011,
    crr_source: 'default',
    air_density_kg_m3: 1.225,
    mass_kg: 1400,
    grade_rad: 0,
    grade_pct: 0,
    grade_source: 'gps',
    ...overrides,
  };
}

function bp(rpm: number, i: number, a: number, r: number, g: number): PowerBreakdownPoint {
  return { rpm, p_inertia_kw: i, p_aero_kw: a, p_roll_kw: r, p_grade_kw: g, total_kw: i + a + r + g };
}

const BREAKDOWN: PowerBreakdownPoint[] = [
  bp(3050, 80, 10, 5, 2),
  bp(4050, 120, 18, 7, 5), // highest total
  bp(5050, 100, 24, 8, 6),
];

describe('ExpertView', () => {
  it('renders the road-load assumptions', () => {
    render(<ExpertView roadLoad={roadLoad()} breakdown={BREAKDOWN} peakRpm={4050} unit="kW" />);
    const panel = screen.getByTestId('expert-view');
    expect(panel.textContent).toContain('CdA 0.70 m²');
    expect(panel.textContent).toContain('Crr 0.011');
    expect(panel.textContent).toContain('kg/m³');
    expect(panel.textContent).toContain('Mass 1400 kg');
  });

  it('labels CdA provenance (vehicle vs default)', () => {
    const { unmount } = render(
      <ExpertView roadLoad={roadLoad({ cd_a_source: 'vehicle' })} breakdown={BREAKDOWN} peakRpm={4050} unit="kW" />,
    );
    expect(screen.getByTestId('expert-view').textContent).toContain('vehicle');
    unmount();
    render(<ExpertView roadLoad={roadLoad({ cd_a_source: 'default' })} breakdown={BREAKDOWN} peakRpm={4050} unit="kW" />);
    expect(screen.getByTestId('expert-view').textContent).toContain('default');
  });

  it('branches the grade label across sources/signs', () => {
    const variants: Array<[Partial<RoadLoadSummary>, string]> = [
      [{ grade_source: 'unavailable' }, 'n/a'],
      [{ grade_source: 'gps', grade_pct: 0 }, 'Grade flat'],
      [{ grade_source: 'gps', grade_pct: 2.1 }, 'uphill'],
      [{ grade_source: 'gps', grade_pct: -1.4 }, 'downhill'],
    ];
    for (const [ov, expected] of variants) {
      const { unmount } = render(
        <ExpertView roadLoad={roadLoad(ov)} breakdown={BREAKDOWN} peakRpm={4050} unit="kW" />,
      );
      expect(screen.getByTestId('expert-view').textContent).toContain(expected);
      unmount();
    }
  });

  it('renders the decomposition bar and a legend with all four components', () => {
    render(<ExpertView roadLoad={roadLoad()} breakdown={BREAKDOWN} peakRpm={4050} unit="kW" />);
    const panel = screen.getByTestId('expert-view');
    expect(screen.getByTestId('breakdown-bar')).toBeInTheDocument();
    for (const label of ['Inertia', 'Aero', 'Rolling', 'Grade']) {
      expect(panel.textContent).toContain(label);
    }
    // Split is taken at the requested peak RPM.
    expect(panel.textContent).toContain('4050 RPM');
  });

  it('falls back to the max-total bin when peakRpm is null', () => {
    render(<ExpertView roadLoad={roadLoad()} breakdown={BREAKDOWN} peakRpm={null} unit="kW" />);
    // 4050 has the highest total_kw (150) → chosen as the decomposition point.
    expect(screen.getByTestId('expert-view').textContent).toContain('4050 RPM');
  });

  it('renders a negative grade segment without throwing', () => {
    const downhill = [bp(4050, 120, 18, 7, -10)];
    render(
      <ExpertView
        roadLoad={roadLoad({ grade_pct: -3, grade_rad: -0.03 })}
        breakdown={downhill}
        peakRpm={null}
        unit="kW"
      />,
    );
    expect(screen.getByTestId('breakdown-bar-negative')).toBeInTheDocument();
    // The grade legend entry shows a negative share.
    expect(screen.getByTestId('expert-view').textContent).toContain('−');
  });

  it('renders nothing fatal for an empty breakdown', () => {
    render(<ExpertView roadLoad={roadLoad()} breakdown={[]} peakRpm={null} unit="kW" />);
    expect(screen.getByTestId('expert-view')).toBeInTheDocument();
  });
});
