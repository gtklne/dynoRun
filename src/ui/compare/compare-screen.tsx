import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { runRepository } from '@/api/repositories/run-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { ensureCurrentCurve } from '@/analysis/re-analyze';
import { PowerCurveChart, type CurveSeries, type CurveDisplayMode } from '@/ui/components/power-curve-chart';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { CompareRunsPicker } from './compare-runs-picker';
import { useUnits } from '@/app/units-context';
import { formatRelativeTime } from '@/shared/format-time';
import type { Run, DerivedCurve } from '@/shared/types';

export function CompareScreen() {
  const { vehicleId = '' } = useParams();
  const { unit } = useUnits();
  const [runs, setRuns] = useState<Run[]>([]);
  const [curves, setCurves] = useState<Map<string, DerivedCurve>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chartMode, setChartMode] = useState<CurveDisplayMode>('power');

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

  const series = useMemo<CurveSeries[]>(() => {
    return [...selected].flatMap((id) => {
      const run = runs.find((r) => r.id === id);
      const curve = curves.get(id);
      if (!run || !curve) return [];
      return [{ label: labelFor(run), points: curve.points }];
    });
  }, [selected, runs, curves]);

  const bestSeriesLabel = useMemo<string | undefined>(() => {
    if (!bestRunId || !selected.has(bestRunId)) return undefined;
    const run = runs.find((r) => r.id === bestRunId);
    return run ? labelFor(run) : undefined;
  }, [bestRunId, selected, runs]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <Link to={`/vehicles/${vehicleId}`} className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Vehicle
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100">Compare runs</h1>

      {/* Overlay header + mode switch */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          {selected.size > 0 ? `Overlay (${selected.size})` : 'Overlay'}
        </p>
        <SegmentedControl
          options={[
            { value: 'power', label: 'Power' },
            { value: 'torque', label: 'Torque' },
          ]}
          value={chartMode}
          onChange={setChartMode}
          compact
        />
      </div>

      {/* Chart */}
      {selected.size > 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
          <PowerCurveChart series={series} mode={chartMode} unit={unit} highlightLabel={bestSeriesLabel} />
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center gap-2">
          <svg className="text-zinc-700" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <p className="text-zinc-500 text-sm text-center">Select runs below to overlay their power curves</p>
        </div>
      )}

      {/* Run picker */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          Select runs to compare
        </p>
        <CompareRunsPicker runs={runs} selectedIds={selected} onToggle={toggle} unit={unit} bestRunId={bestRunId} />
      </div>
    </div>
  );
}
