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
    <section>
      <p><Link to={`/vehicles/${vehicleId}`}>← Vehicle</Link></p>
      <h1>Compare runs</h1>
      <CompareRunsPicker runs={runs} selectedIds={selected} onToggle={toggle} />
      <PowerCurveChart series={series} />
    </section>
  );
}
