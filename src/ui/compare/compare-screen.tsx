import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { runRepository } from '@/api/repositories/run-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { ensureCurrentCurve } from '@/analysis/re-analyze';
import { computeCurveDelta, type CurveDeltaPoint } from '@/analysis/curve-delta';
import { PowerCurveChart, type CurveSeries, type CurveDisplayMode } from '@/ui/components/power-curve-chart';
import { DeltaCurveChart } from '@/ui/components/delta-curve-chart';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { CompareRunsPicker } from './compare-runs-picker';
import { useUnits } from '@/app/units-context';
import { formatRelativeTime } from '@/shared/format-time';
import { convertPower, formatPower } from '@/shared/format-power';
import {
  ChannelStrip,
  Chevron,
  CrossRefProvider,
  CrossRefReadout,
  Na,
  NotesBox,
  PlanView,
  ProfileView,
  RevisionBar,
  seriesInk,
  SERIES_DASH,
  TitleBlock,
  usePlateInk,
  useCrossRef,
  Zone,
} from '@/ui/plate';
import type { Run, DerivedCurve, RpmPoint } from '@/shared/types';

type CompareMode = CurveDisplayMode | 'delta';

const CURSOR_SOURCE = 'compare-overlay';

interface DeltaStats {
  maxGain: CurveDeltaPoint | null;
  maxLoss: CurveDeltaPoint | null;
  mean: number;
}

function summarizeDelta(delta: CurveDeltaPoint[]): DeltaStats {
  let maxGain: CurveDeltaPoint | null = null;
  let maxLoss: CurveDeltaPoint | null = null;
  let sum = 0;
  for (const p of delta) {
    sum += p.delta_power_kw;
    if (maxGain == null || p.delta_power_kw > maxGain.delta_power_kw) maxGain = p;
    if (maxLoss == null || p.delta_power_kw < maxLoss.delta_power_kw) maxLoss = p;
  }
  return {
    maxGain,
    maxLoss,
    mean: delta.length === 0 ? 0 : sum / delta.length,
  };
}

/**
 * The bin whose RPM is closest to the cross-referenced instant. Returns null
 * rather than the nearest-at-any-distance so a cursor parked outside a run's
 * own RPM span reports n/a instead of quietly quoting that run's end bin.
 */
function binAt(points: RpmPoint[], rpm: number): RpmPoint | null {
  if (points.length === 0) return null;
  let best = points[0];
  for (const p of points) {
    if (Math.abs(p.rpm - rpm) < Math.abs(best.rpm - rpm)) best = p;
  }
  return Math.abs(best.rpm - rpm) <= 150 ? best : null;
}

export function CompareScreen() {
  return (
    <CrossRefProvider>
      <CompareSheet />
    </CrossRefProvider>
  );
}

function CompareSheet() {
  const { vehicleId = '' } = useParams();
  const { unit } = useUnits();
  const ink = usePlateInk();
  const { position, setPosition } = useCrossRef();
  const [runs, setRuns] = useState<Run[]>([]);
  const [curves, setCurves] = useState<Map<string, DerivedCurve>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chartMode, setChartMode] = useState<CompareMode>('power');

  useEffect(() => {
    (async () => {
      const allRuns = await runRepository.listByVehicle(vehicleId);
      const complete = allRuns.filter((r) => r.status === 'complete');
      const map = new Map<string, DerivedCurve>();
      for (const r of complete) {
        const c = await derivedCurveRepository.getByRun(r.id);
        const ensured = await ensureCurrentCurve(r.id, c);
        if (ensured) map.set(r.id, ensured);
      }
      setRuns(complete.filter((r) => map.has(r.id)));
      setCurves(map);
    })();
  }, [vehicleId]);

  const bestRunId = useMemo<string | null>(() => {
    let bestId: string | null = null;
    let bestKw = -Infinity;
    for (const r of runs) {
      if (r.peak_power_kw == null) continue;
      if (r.peak_power_kw > bestKw) {
        bestKw = r.peak_power_kw;
        bestId = r.id;
      }
    }
    return bestId;
  }, [runs]);

  function labelFor(run: Run): string {
    return run.title || `${run.gear_label} / ${formatRelativeTime(run.started_at)}`;
  }

  const selectedRuns = useMemo<Run[]>(
    () => [...selected].map((id) => runs.find((r) => r.id === id)).filter((r): r is Run => !!r),
    [selected, runs],
  );

  const series = useMemo<CurveSeries[]>(() => {
    return selectedRuns.flatMap((run) => {
      const curve = curves.get(run.id);
      if (!curve) return [];
      return [{ label: labelFor(run), points: curve.points }];
    });
  }, [selectedRuns, curves]);

  // The picker shows each run's swatch, so it needs the same index the chart
  // assigns. Derived from the plotted series, not the selection set, because a
  // selected run whose curve failed to load is not on the plot at all.
  const seriesIndexById = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const run of selectedRuns) {
      if (!curves.has(run.id)) continue;
      map.set(run.id, i);
      i += 1;
    }
    return map;
  }, [selectedRuns, curves]);

  const bestSeriesLabel = useMemo<string | undefined>(() => {
    if (!bestRunId || !selected.has(bestRunId)) return undefined;
    const run = runs.find((r) => r.id === bestRunId);
    return run ? labelFor(run) : undefined;
  }, [bestRunId, selected, runs]);

  // For the picker delta column: anchor on the strongest selected run.
  const bestSelected = useMemo<{ kw: number; id: string } | null>(() => {
    let bestKw = -Infinity;
    let bestId: string | null = null;
    for (const r of selectedRuns) {
      if (r.peak_power_kw == null) continue;
      if (r.peak_power_kw > bestKw) {
        bestKw = r.peak_power_kw;
        bestId = r.id;
      }
    }
    return bestId == null ? null : { kw: bestKw, id: bestId };
  }, [selectedRuns]);

  const isPair = selectedRuns.length === 2;
  const pairA = isPair ? selectedRuns[0] : null;
  const pairB = isPair ? selectedRuns[1] : null;

  const delta = useMemo<CurveDeltaPoint[]>(() => {
    if (!pairA || !pairB) return [];
    const a = curves.get(pairA.id);
    const b = curves.get(pairB.id);
    if (!a || !b) return [];
    return computeCurveDelta(a.points, b.points);
  }, [pairA, pairB, curves]);

  const deltaStats = useMemo<DeltaStats>(() => summarizeDelta(delta), [delta]);

  // Demote delta selection if the user expands/contracts the comparison set.
  useEffect(() => {
    if (chartMode === 'delta' && !isPair) setChartMode('power');
  }, [chartMode, isPair]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const segmentOptions = [
    { value: 'power' as const, label: 'Power' },
    { value: 'torque' as const, label: 'Torque' },
    { value: 'delta' as const, label: 'Delta' },
  ];

  const rpmSpan = useMemo<{ lo: number; hi: number } | null>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const run of selectedRuns) {
      const c = curves.get(run.id);
      if (!c) continue;
      lo = Math.min(lo, c.rpm_min);
      hi = Math.max(hi, c.rpm_max);
    }
    return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi } : null;
  }, [selectedRuns, curves]);

  const colors = seriesInk(ink);
  const cursorRpm = position?.at ?? null;

  const channels = selectedRuns.flatMap((run) => {
    const curve = curves.get(run.id);
    const idx = seriesIndexById.get(run.id);
    if (!curve || idx == null) return [];
    const bin = cursorRpm == null ? null : binAt(curve.points, cursorRpm);
    return [
      {
        name: labelFor(run),
        color: colors[idx % colors.length],
        unit: chartMode === 'torque' ? 'Nm' : unit,
        value:
          bin == null ? (
            <Na title="This run has no bin at the cross-referenced RPM" />
          ) : chartMode === 'torque' ? (
            bin.wheel_torque_nm.toFixed(1)
          ) : (
            convertPower(bin.wheel_power_kw, unit).toFixed(unit === 'kW' ? 1 : 0)
          ),
      },
    ];
  });

  const pipelineVersions = [...new Set([...curves.values()].map((c) => c.pipeline_version))];

  return (
    <div className="plate-stack">
      <div>
        <Link
          to={`/vehicles/${vehicleId}`}
          className="t-label mb-2 inline-flex items-center gap-1.5 no-underline hover:underline"
        >
          <Chevron direction="left" />
          Vehicle
        </Link>

        <TitleBlock
          title="Compare runs"
          meta={[
            { label: 'Runs on file', value: runs.length },
            { label: 'On the plot', value: selected.size },
            { label: 'Channel', value: chartMode === 'delta' ? 'Delta' : chartMode === 'torque' ? 'Torque' : 'Power' },
            { label: 'Power unit', value: unit },
          ]}
          actions={
            <SegmentedControl
              options={segmentOptions}
              value={chartMode}
              onChange={(v) => {
                if (v === 'delta' && !isPair) return;
                setChartMode(v);
              }}
              compact
            />
          }
        />
      </div>

      <div className="plate-stack lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4 lg:space-y-0 lg:items-start">
        <div className="plate-stack">
          {chartMode === 'delta' ? (
            isPair && pairA && pairB ? (
              <>
                <PlanView
                  label="Delta field"
                  scale={`${labelFor(pairA)} minus ${labelFor(pairB)}, per 100 RPM bin`}
                >
                  <div className="p-1.5">
                    <DeltaCurveChart
                      delta={delta}
                      unit={unit}
                      labelA={labelFor(pairA)}
                      labelB={labelFor(pairB)}
                    />
                  </div>
                </PlanView>
                <DeltaSummary
                  labelA={labelFor(pairA)}
                  labelB={labelFor(pairB)}
                  stats={deltaStats}
                  unit={unit}
                />
              </>
            ) : (
              <Zone label="Delta field" flush>
                <div className="hatch px-3 py-10 text-center">
                  <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
                    Select exactly 2 runs to see the delta.
                  </p>
                </div>
              </Zone>
            )
          ) : selected.size > 0 ? (
            <>
              <PlanView
                label={chartMode === 'torque' ? 'Torque overlay' : 'Power overlay'}
                scale={
                  rpmSpan
                    ? `${Math.round(rpmSpan.lo)}-${Math.round(rpmSpan.hi)} RPM, 100 RPM bins`
                    : 'No RPM span'
                }
                legend={
                  <div className="space-y-0">
                    {series.map((s, i) => (
                      <ChannelStrip
                        key={s.label}
                        color={colors[i % colors.length]}
                        dash={SERIES_DASH[i % SERIES_DASH.length]}
                        name={s.label}
                      />
                    ))}
                  </div>
                }
              >
                <div className="p-1.5">
                  <PowerCurveChart
                    series={series}
                    mode={chartMode}
                    unit={unit}
                    highlightLabel={bestSeriesLabel}
                    onCursor={(rpm) =>
                      setPosition(rpm == null ? null : { at: rpm, source: CURSOR_SOURCE })
                    }
                  />
                </div>
              </PlanView>

              <ProfileView label="Cross-reference" axis="Every run at the same RPM">
                <CrossRefReadout
                  axisLabel="RPM"
                  axisValue={cursorRpm == null ? <Na /> : Math.round(cursorRpm)}
                  channels={channels}
                  idle="Move across the overlay to read every run at one RPM"
                />
              </ProfileView>
            </>
          ) : (
            <Zone label="Power overlay" flush>
              <div className="hatch px-3 py-10 text-center">
                <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
                  Select runs below to overlay their power curves.
                </p>
              </div>
            </Zone>
          )}

          <NotesBox title="What this comparison is worth">
            Wheel power here is estimated from GPS acceleration, vehicle mass, the calibrated gear
            rollout, and road-load assumptions. It is not a calibrated rolling-road dyno figure.
            Read the difference between two runs, not the absolute number, and compare only runs
            taken in similar conditions: the conditions each run was logged with are listed beside
            it below.
          </NotesBox>
        </div>

        <div className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <Zone label="Runs to compare" note={`${selected.size} of ${runs.length} selected`} flush>
            <CompareRunsPicker
              runs={runs}
              selectedIds={selected}
              onToggle={toggle}
              unit={unit}
              bestRunId={bestRunId}
              bestSelectedKw={bestSelected?.kw ?? null}
              bestSelectedRunId={bestSelected?.id ?? null}
              seriesIndexById={seriesIndexById}
            />
          </Zone>
        </div>
      </div>

      <RevisionBar
        entries={[
          {
            label: 'Pipeline',
            value: pipelineVersions.length === 0 ? <Na /> : `v${pipelineVersions.join(', v')}`,
          },
          { label: 'Bin width', value: '100 RPM' },
          { label: 'Reading', value: 'Wheel power, uncorrected for driveline loss' },
        ]}
      />
    </div>
  );
}

interface DeltaSummaryProps {
  labelA: string;
  labelB: string;
  stats: DeltaStats;
  unit: 'kW' | 'hp' | 'PS';
}

function DeltaSummary({ labelA, labelB, stats, unit }: DeltaSummaryProps) {
  const decimals = unit === 'kW' ? 1 : 0;
  const fmt = (kw: number): string => {
    const v = convertPower(kw, unit);
    const sign = v > 0 ? '+' : v < 0 ? '−' : '±';
    return `${sign}${Math.abs(v).toFixed(decimals)} ${unit}`;
  };

  const hasData = stats.maxGain != null || stats.maxLoss != null;

  return (
    <Zone label="Run A vs run B" flush>
      <dl className="grid grid-cols-1 sm:grid-cols-2">
        <div className="px-3 py-2">
          <dt className="t-annotation">A</dt>
          <dd className="t-data mt-1 text-sm">{labelA}</dd>
          <dd className="t-annotation mt-1">
            {stats.maxGain ? `peak ${formatPower(stats.maxGain.a_power_kw, unit)}` : <Na />}
          </dd>
        </div>
        <div className="rule-t px-3 py-2 sm:border-t-0 sm:rule-l">
          <dt className="t-annotation">B</dt>
          <dd className="t-data mt-1 text-sm">{labelB}</dd>
          <dd className="t-annotation mt-1">
            {stats.maxLoss ? `peak ${formatPower(stats.maxLoss.b_power_kw, unit)}` : <Na />}
          </dd>
        </div>
      </dl>

      {hasData ? (
        <dl className="rule-t grid grid-cols-1 sm:grid-cols-3">
          <div className="px-3 py-2">
            <dt className="t-annotation">Max gain</dt>
            <dd className="t-data mt-0.5 text-sm" style={{ color: 'var(--color-go)' }}>
              {stats.maxGain && stats.maxGain.delta_power_kw > 0 ? (
                `${fmt(stats.maxGain.delta_power_kw)} at ${Math.round(stats.maxGain.rpm)} RPM`
              ) : (
                <Na title="A never leads B" />
              )}
            </dd>
          </div>
          <div className="rule-t px-3 py-2 sm:border-t-0 sm:rule-l">
            <dt className="t-annotation">Max loss</dt>
            <dd className="t-data mt-0.5 text-sm" style={{ color: 'var(--color-stop)' }}>
              {stats.maxLoss && stats.maxLoss.delta_power_kw < 0 ? (
                `${fmt(stats.maxLoss.delta_power_kw)} at ${Math.round(stats.maxLoss.rpm)} RPM`
              ) : (
                <Na title="A never trails B" />
              )}
            </dd>
          </div>
          <div className="rule-t px-3 py-2 sm:border-t-0 sm:rule-l">
            <dt className="t-annotation">Mean delta</dt>
            <dd className="t-data mt-0.5 text-sm">{fmt(stats.mean)}</dd>
          </div>
        </dl>
      ) : (
        <div className="hatch rule-t px-3 py-5 text-center">
          <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
            No overlapping RPM range.
          </p>
        </div>
      )}
    </Zone>
  );
}
