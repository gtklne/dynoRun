import { useMemo } from 'react';
import { PowerCurveChart, type CurveSeries } from '@/ui/components/power-curve-chart';
import { formatPower, type PowerUnit } from '@/shared/format-power';
import type { RoadLoadSummary } from '@/analysis/types';
import type { PowerBreakdownPoint } from '@/analysis/rpm-bin';
import { NotesBox, seriesInk, SERIES_DASH, usePlateInk, Zone, type PlateInk } from '@/ui/plate';

// Single source of truth for component identity, shared by the stacked bar, the
// legend and the breakdown chart. Ink and dash come from the plate's series
// order, so the bar, the legend swatch and the curve are the same series in all
// three places, and the identity survives a colour-blind reader.
const COMPONENT_KEYS = [
  { key: 'p_inertia_kw', label: 'Inertia' },
  { key: 'p_aero_kw', label: 'Aero' },
  { key: 'p_roll_kw', label: 'Rolling' },
  { key: 'p_grade_kw', label: 'Grade' },
] as const;

type ComponentKey = (typeof COMPONENT_KEYS)[number]['key'];

interface ComponentMeta {
  key: ComponentKey;
  label: string;
  color: string;
  dash: number[];
}

function componentMeta(ink: PlateInk): ComponentMeta[] {
  const inks = seriesInk(ink);
  return COMPONENT_KEYS.map((m, i) => ({
    key: m.key,
    label: m.label,
    color: inks[i % inks.length],
    dash: SERIES_DASH[i % SERIES_DASH.length],
  }));
}

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

/** One stated assumption. A ruled cell, never a filled pill: these are values
 *  the reader has to be able to check, not tags. */
function Assumption({ value, source }: { value: string; source?: string }) {
  return (
    <div className="box px-2.5 py-1">
      <span className="t-data text-xs">{value}</span>
      {source && <span className="t-annotation ml-1.5">{source}</span>}
    </div>
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
  const ink = usePlateInk();
  const meta = componentMeta(ink);
  const peakPoint = pickPeakPoint(breakdown, peakRpm);

  // Percentages are relative to the sum of POSITIVE contributions (downhill grade
  // is negative and shown as a negative %), so the bar reads honestly even when a
  // component subtracts power.
  const components = peakPoint ? meta.map((m) => ({ ...m, kw: peakPoint[m.key] })) : [];
  const positiveSum = components.reduce((s, c) => (c.kw > 0 ? s + c.kw : s), 0);
  const positives = components.filter((c) => c.kw > 0);
  const negatives = components.filter((c) => c.kw < 0);

  // Memoised so a re-render (the cross-reference cursor moves on the plate
  // above) does not hand the chart a new array identity and rebuild the plot.
  const seriesData = useMemo<CurveSeries[]>(() => {
    const out: CurveSeries[] = meta.map((m) => ({
      label: m.label,
      stroke: m.color,
      dash: m.dash,
      points: breakdown.map((b) => ({ rpm: b.rpm, wheel_power_kw: b[m.key], wheel_torque_nm: 0 })),
    }));
    out.push({
      // A reference line, not a fifth component: terrain ink, so it recedes
      // behind the four forces it is the sum of.
      label: 'Total',
      stroke: ink.terrain,
      dash: [],
      points: breakdown.map((b) => ({ rpm: b.rpm, wheel_power_kw: b.total_kw, wheel_torque_nm: 0 })),
    });
    return out;
    // `meta` is derived from `ink`, so `ink` alone pins both.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdown, ink]);

  return (
    <div data-testid="expert-view" className="space-y-5">
      <Zone label="Road-load assumptions">
        <div className="flex flex-wrap gap-2 px-3 py-2.5">
          <Assumption value={`CdA ${roadLoad.cd_a_m2.toFixed(2)} m²`} source={roadLoad.cd_a_source} />
          <Assumption value={`Crr ${roadLoad.crr.toFixed(3)}`} source={roadLoad.crr_source} />
          <Assumption value={gradeLabel(roadLoad)} />
          <Assumption value={`ρ ${roadLoad.air_density_kg_m3.toFixed(3)} kg/m³`} />
          <Assumption value={`Mass ${roadLoad.mass_kg.toFixed(0)} kg`} />
        </div>
      </Zone>

      {peakPoint && (
        <Zone
          label={`Power split at ${peakPoint.rpm.toFixed(0)} RPM`}
          note={formatPower(peakPoint.total_kw, unit)}
        >
          <div className="px-3 py-3">
            {positiveSum > 0 && (
              <div
                className="flex h-6"
                data-testid="breakdown-bar"
                style={{ border: 'var(--rule-hair) solid var(--color-rule)' }}
              >
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
              <div className="mt-1 flex h-2" data-testid="breakdown-bar-negative">
                {negatives.map((c) => (
                  <div
                    key={c.key}
                    className="hatch"
                    style={{
                      width: `${(Math.abs(c.kw) / positiveSum) * 100}%`,
                      borderTop: `2px solid ${c.color}`,
                    }}
                    title={`${c.label} ${formatPower(c.kw, unit)} (subtracted)`}
                  />
                ))}
              </div>
            )}
          </div>

          <dl className="rule-t">
            {components.map((c) => {
              const pct = positiveSum > 0 ? (c.kw / positiveSum) * 100 : 0;
              return (
                <div
                  key={c.key}
                  className="rule-t flex items-center gap-2.5 px-3 py-1.5 first:border-t-0"
                >
                  <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true" className="shrink-0">
                    <line
                      x1="0"
                      y1="5"
                      x2="22"
                      y2="5"
                      stroke={c.color}
                      strokeWidth="2.5"
                      strokeDasharray={c.dash.length ? c.dash.join(' ') : undefined}
                    />
                  </svg>
                  <dt className="t-label">{c.label}</dt>
                  <dd className="t-data ml-auto text-sm">{formatPower(c.kw, unit)}</dd>
                  <dd className="t-annotation w-12 text-right">
                    {pct >= 0 ? '' : '−'}
                    {Math.abs(pct).toFixed(0)}%
                  </dd>
                </div>
              );
            })}
          </dl>
        </Zone>
      )}

      {breakdown.length > 0 && (
        <Zone label="Force contributions vs RPM">
          <div className="p-2">
            <PowerCurveChart series={seriesData} mode="power" unit={unit} />
          </div>
        </Zone>
      )}

      <NotesBox title="Reading this">
        Percentages are shares of the positive drive power; grade is negative downhill. Each line in
        the chart is one force&apos;s contribution to wheel power, and the four sum to Total.
      </NotesBox>
    </div>
  );
}
