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

  if (!run || !curve) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

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
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-zinc-100">Run review</h1>

      {/* Peak stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak power</p>
          <p className="tabular-nums">
            <span className="text-3xl font-bold text-amber-400">{peak.wheel_power_kw.toFixed(1)}</span>
            <span className="text-sm text-zinc-400 ml-1">kW</span>
          </p>
          <p className="text-zinc-600 text-xs mt-1">{(peak.wheel_power_kw * 1.341).toFixed(0)} hp</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">At RPM</p>
          <p className="tabular-nums">
            <span className="text-3xl font-bold text-zinc-100">{peak.rpm.toFixed(0)}</span>
          </p>
          <p className="text-zinc-600 text-xs mt-1">{curve.points.length} data points</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
        <PowerCurveChart series={[{ label: 'Power', points: curve.points }]} />
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="run-notes" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Notes</label>
        <textarea
          id="run-notes"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm resize-none"
          rows={3}
          value={notes}
          placeholder="Conditions, modifications, observations…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={save}
          className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors"
        >
          Save run
        </button>
        <button
          onClick={discard}
          className="flex-1 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 font-medium py-3.5 rounded-xl transition-colors border border-zinc-700"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
