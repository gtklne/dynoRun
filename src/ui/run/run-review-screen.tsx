import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { RunRepository } from '@/storage/repositories/run-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import type { Run, DerivedCurve } from '@/shared/types';

export function RunReviewScreen() {
  const { runId = '' } = useParams();
  const db = useDatabase();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [curve, setCurve] = useState<DerivedCurve | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const r = await new RunRepository(db).get(runId);
      const c = await new DerivedCurveRepository(db).getByRun(runId);
      setRun(r);
      setCurve(c);
      if (r) setNotes(r.notes);
    })();
  }, [db, runId]);

  if (!run || !curve) return <p>Loading…</p>;

  const peak = curve.points.reduce(
    (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
    curve.points[0],
  );

  async function save() {
    if (!run) return;
    const repo = new RunRepository(db);
    await repo.updateNotes(run.id, notes);
    await repo.markComplete(run.id);
    navigate(`/vehicles/${run.vehicle_id}`);
  }

  async function discard() {
    if (!run) return;
    await new RunRepository(db).markAborted(run.id);
    navigate(`/vehicles/${run.vehicle_id}`);
  }

  return (
    <section>
      <h1>Run review</h1>
      <p>Peak power: <strong>{peak.wheel_power_kw.toFixed(1)} kW</strong> @ {peak.rpm.toFixed(0)} RPM</p>
      <PowerCurveChart series={[{ label: 'Power', points: curve.points }]} />
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div>
        <button onClick={save}>Save</button>
        <button onClick={discard}>Discard</button>
      </div>
    </section>
  );
}
