import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { RunRepository } from '@/storage/repositories/run-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { PowerCurveChart, type CurveSeries } from '@/ui/components/power-curve-chart';
import { CompareRunsPicker } from './compare-runs-picker';
import type { Run, DerivedCurve } from '@/shared/types';

export function CompareScreen() {
  const { vehicleId = '' } = useParams();
  const db = useDatabase();
  const [runs, setRuns] = useState<Run[]>([]);
  const [curves, setCurves] = useState<Map<string, DerivedCurve>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const allRuns = await new RunRepository(db).listByVehicle(vehicleId);
      const complete = allRuns.filter((r) => r.status === 'complete');
      const curveRepo = new DerivedCurveRepository(db);
      const map = new Map<string, DerivedCurve>();
      for (const r of complete) {
        const c = await curveRepo.getByRun(r.id);
        if (c) map.set(r.id, c);
      }
      setRuns(complete.filter((r) => map.has(r.id)));
      setCurves(map);
    })();
  }, [db, vehicleId]);

  const series = useMemo<CurveSeries[]>(() => {
    return [...selected].flatMap((id) => {
      const run = runs.find((r) => r.id === id);
      const curve = curves.get(id);
      if (!run || !curve) return [];
      const label = run.notes || `${run.started_at}`;
      return [{ label, points: curve.points }];
    });
  }, [selected, runs, curves]);

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

      {/* Chart */}
      {selected.size > 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
          <PowerCurveChart series={series} />
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
        <CompareRunsPicker runs={runs} selectedIds={selected} onToggle={toggle} />
      </div>
    </div>
  );
}
