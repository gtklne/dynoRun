import type { ReactNode } from 'react';
import { PowerCurveChart, type CurveSeries } from '@/ui/components/power-curve-chart';
import { formatPower, type PowerUnit } from '@/shared/format-power';
import type { RoadLoadSummary } from '@/analysis/types';
import type { PowerBreakdownPoint } from '@/analysis/rpm-bin';

// Single source of truth for component identity (label + colour), shared by the
// stacked bar, the legend, and the breakdown chart. Colours are the first four
// entries of the chart's DEFAULT_PALETTE so everything stays consistent.
const COMPONENT_META = [
  { key: 'p_inertia_kw', label: 'Inertia', color: '#f59e0b' },
  { key: 'p_aero_kw', label: 'Aero', color: '#22d3ee' },
  { key: 'p_roll_kw', label: 'Rolling', color: '#a78bfa' },
  { key: 'p_grade_kw', label: 'Grade', color: '#34d399' },
] as const;

const TOTAL_COLOR = '#a1a1aa'; // zinc-400 — reads as a reference line, not a 5th component

interface ExpertViewProps {
  roadLoad: RoadLoadSummary;
  breakdown: PowerBreakdownPoint[];
  /** RPM to decompose at; falls back to the max-total-power bin when null. */
  peakRpm: number | null;
  unit: PowerUnit;
}

function gradeLabel(rl: RoadLoadSummary): string {
  if (rl.grade_source === 'unavailable') return 'Grade n/a (no GPS alt)';
  if (Math.abs(rl.grade_pct) < 0.1) return 'Grade flat';
  const dir = rl.grade_pct > 0 ? 'uphill' : 'downhill';
  const sign = rl.grade_pct > 0 ? '+' : '−';
  return `Grade ${sign}${Math.abs(rl.grade_pct).toFixed(1)}% ${dir}`;
}

function Chip({ children, source }: { children: ReactNode; source?: string }) {
  return (
    <span className="bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-xs text-zinc-200 tabular-nums">
      {children}
      {source && <span className="text-zinc-500"> · {source}</span>}
    </span>
  );
}

function pickPeakPoint(
  breakdown: PowerBreakdownPoint[],
  peakRpm: number | null,
): PowerBreakdownPoint | null {
  if (breakdown.length === 0) return null;
  if (peakRpm != null) {
    return breakdown.reduce(
      (best, b) => (Math.abs(b.rpm - peakRpm) < Math.abs(best.rpm - peakRpm) ? b : best),
      breakdown[0],
    );
  }
  return breakdown.reduce((best, b) => (b.total_kw > best.total_kw ? b : best), breakdown[0]);
}

export function ExpertView({ roadLoad, breakdown, peakRpm, unit }: ExpertViewProps) {
  const peakPoint = pickPeakPoint(breakdown, peakRpm);

  // Percentages are relative to the sum of POSITIVE contributions (downhill grade
  // is negative and shown as a negative %), so the bar reads honestly even when a
  // component subtracts power.
  const components = peakPoint
    ? COMPONENT_META.map((m) => ({ ...m, kw: peakPoint[m.key] }))
    : [];
  const positiveSum = components.reduce((s, c) => (c.kw > 0 ? s + c.kw : s), 0);
  const positives = components.filter((c) => c.kw > 0);
  const negatives = components.filter((c) => c.kw < 0);

  const seriesData: CurveSeries[] = COMPONENT_META.map((m) => ({
    label: m.label,
    stroke: m.color,
    points: breakdown.map((b) => ({ rpm: b.rpm, wheel_power_kw: b[m.key], wheel_torque_nm: 0 })),
  }));
  seriesData.push({
    label: 'Total',
    stroke: TOTAL_COLOR,
    points: breakdown.map((b) => ({ rpm: b.rpm, wheel_power_kw: b.total_kw, wheel_torque_nm: 0 })),
  });

  return (
    <div
      data-testid="expert-view"
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3"
    >
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Expert view</p>

      {/* Assumptions */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
        <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Road-load assumptions</p>
        <div className="flex flex-wrap gap-2">
          <Chip source={roadLoad.cd_a_source}>CdA {roadLoad.cd_a_m2.toFixed(2)} m²</Chip>
          <Chip source={roadLoad.crr_source}>Crr {roadLoad.crr.toFixed(3)}</Chip>
          <Chip>{gradeLabel(roadLoad)}</Chip>
          <Chip>ρ {roadLoad.air_density_kg_m3.toFixed(3)} kg/m³</Chip>
          <Chip>Mass {roadLoad.mass_kg.toFixed(0)} kg</Chip>
        </div>
      </div>

      {/* Peak-power decomposition */}
      {peakPoint && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">
              Power split @ {peakPoint.rpm.toFixed(0)} RPM
            </p>
            <p className="text-zinc-300 text-sm font-semibold tabular-nums">
              {formatPower(peakPoint.total_kw, unit)}
            </p>
          </div>

          {positiveSum > 0 && (
            <div className="flex h-6 rounded-lg overflow-hidden bg-zinc-900" data-testid="breakdown-bar">
              {positives.map((c) => (
                <div
                  key={c.key}
                  style={{ width: `${(c.kw / positiveSum) * 100}%`, backgroundColor: c.color }}
                  title={`${c.label} ${formatPower(c.kw, unit)}`}
                />
              ))}
            </div>
          )}
          {negatives.length > 0 && positiveSum > 0 && (
            <div className="flex h-2 rounded overflow-hidden" data-testid="breakdown-bar-negative">
              {negatives.map((c) => (
                <div
                  key={c.key}
                  style={{ width: `${(Math.abs(c.kw) / positiveSum) * 100}%`, backgroundColor: c.color, opacity: 0.5 }}
                  title={`${c.label} ${formatPower(c.kw, unit)} (subtracted)`}
                />
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {components.map((c) => {
              const pct = positiveSum > 0 ? (c.kw / positiveSum) * 100 : 0;
              return (
                <div key={c.key} className="flex items-center gap-2 text-xs tabular-nums">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-zinc-400">{c.label}</span>
                  <span className="text-zinc-200 ml-auto">{formatPower(c.kw, unit)}</span>
                  <span className="text-zinc-500 w-12 text-right">
                    {pct >= 0 ? '' : '−'}{Math.abs(pct).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-zinc-600 text-[10px]">
            % of positive drive power; grade is negative downhill.
          </p>
        </div>
      )}

      {/* Per-RPM breakdown curve */}
      {breakdown.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 space-y-1">
          <PowerCurveChart series={seriesData} mode="power" unit={unit} />
          <p className="text-zinc-600 text-[10px] text-center">
            Each line is that force's contribution to wheel power vs RPM; the four sum to Total.
          </p>
        </div>
      )}
    </div>
  );
}
