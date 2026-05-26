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
import type { Run, DerivedCurve } from '@/shared/types';

type CompareMode = CurveDisplayMode | 'delta';

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

export function CompareScreen() {
  const { vehicleId = '' } = useParams();
  const { unit } = useUnits();
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
    return run.title || `${run.gear_label} · ${formatRelativeTime(run.started_at)}`;
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

  return (
    <div className="space-y-5">
      <Link to={`/vehicles/${vehicleId}`} className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Vehicle
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100">Compare runs</h1>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          {selected.size > 0 ? `Overlay (${selected.size})` : 'Overlay'}
        </p>
        <SegmentedControl
          options={segmentOptions}
          value={chartMode}
          onChange={(v) => {
            if (v === 'delta' && !isPair) return;
            setChartMode(v);
          }}
          compact
        />
      </div>

      {chartMode === 'delta' ? (
        isPair && pairA && pairB ? (
          <div className="space-y-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
              <DeltaCurveChart
                delta={delta}
                unit={unit}
                labelA={labelFor(pairA)}
                labelB={labelFor(pairB)}
              />
            </div>
            <DeltaSummary
              labelA={labelFor(pairA)}
              labelB={labelFor(pairB)}
              stats={deltaStats}
              unit={unit}
            />
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center gap-2">
            <svg className="text-zinc-700" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h18"/>
              <path d="M12 3v18"/>
            </svg>
            <p className="text-zinc-500 text-sm text-center">
              Select exactly 2 runs to see the delta.
            </p>
          </div>
        )
      ) : selected.size > 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
          <PowerCurveChart
            series={series}
            mode={chartMode}
            unit={unit}
            highlightLabel={bestSeriesLabel}
          />
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center gap-2">
          <svg className="text-zinc-700" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <p className="text-zinc-500 text-sm text-center">Select runs below to overlay their power curves</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          Select runs to compare
        </p>
        <CompareRunsPicker
          runs={runs}
          selectedIds={selected}
          onToggle={toggle}
          unit={unit}
          bestRunId={bestRunId}
          bestSelectedKw={bestSelected?.kw ?? null}
          bestSelectedRunId={bestSelected?.id ?? null}
        />
      </div>
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          Run A vs Run B
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <p className="text-zinc-300">
          <span className="text-emerald-400 font-semibold">A:</span>{' '}
          <span className="text-zinc-200">{labelA}</span>
          {stats.maxGain && (
            <span className="block text-zinc-500 text-xs">
              peak {formatPower(stats.maxGain.a_power_kw, unit)}
            </span>
          )}
        </p>
        <p className="text-zinc-300">
          <span className="text-rose-400 font-semibold">B:</span>{' '}
          <span className="text-zinc-200">{labelB}</span>
          {stats.maxLoss && (
            <span className="block text-zinc-500 text-xs">
              peak {formatPower(stats.maxLoss.b_power_kw, unit)}
            </span>
          )}
        </p>
      </div>
      {hasData ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Max gain</p>
            <p className="text-emerald-400 font-semibold tabular-nums">
              {stats.maxGain && stats.maxGain.delta_power_kw > 0
                ? `${fmt(stats.maxGain.delta_power_kw)} @ ${Math.round(stats.maxGain.rpm)} RPM`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Max loss</p>
            <p className="text-rose-400 font-semibold tabular-nums">
              {stats.maxLoss && stats.maxLoss.delta_power_kw < 0
                ? `${fmt(stats.maxLoss.delta_power_kw)} @ ${Math.round(stats.maxLoss.rpm)} RPM`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Mean Δ</p>
            <p className="text-zinc-200 font-semibold tabular-nums">{fmt(stats.mean)}</p>
          </div>
        </div>
      ) : (
        <p className="text-zinc-500 text-sm pt-2 border-t border-zinc-800">
          No overlapping RPM range.
        </p>
      )}
    </div>
  );
}
