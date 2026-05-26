import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { runRepository } from '@/api/repositories/run-repository';
import type { Vehicle, Run } from '@/shared/types';
import { formatRelativeTime } from '@/shared/format-time';
import { useUnits } from '@/app/units-context';

interface RowVm {
  run: Run;
  vehicle: Vehicle | null;
}

export function AllRunsScreen() {
  const [rows, setRows] = useState<RowVm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { format } = useUnits();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vehicles = await vehicleRepository.list();
        const byId = new Map(vehicles.map((v) => [v.id, v]));
        const lists = await Promise.all(vehicles.map((v) => runRepository.listByVehicle(v.id)));
        const flat: RowVm[] = lists
          .flat()
          .filter((r) => r.status === 'complete')
          .map((r) => ({ run: r, vehicle: byId.get(r.vehicle_id) ?? null }))
          .sort((a, b) => b.run.started_at.localeCompare(a.run.started_at));
        if (!cancelled) setRows(flat);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const total = useMemo(() => rows?.length ?? 0, [rows]);

  if (rows === null && !error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Runs</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {total === 0 ? 'No complete runs yet.' : `${total} complete run${total === 1 ? '' : 's'} across all vehicles`}
        </p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-3">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {rows && rows.length === 0 && !error && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-zinc-400 text-sm">Your runs will appear here.</p>
          <p className="text-zinc-600 text-xs mt-1">Add a vehicle, calibrate a gear, and record a run.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map(({ run, vehicle }) => (
            <Link
              key={run.id}
              to={`/runs/${run.id}/review`}
              className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-100 font-medium text-sm truncate">
                    {run.title ?? `${vehicle?.name ?? 'Unknown vehicle'} · ${run.gear_label}`}
                  </p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {vehicle?.name ?? '—'} · {run.gear_label} · {formatRelativeTime(run.started_at)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="tabular-nums text-amber-400 font-semibold text-sm">
                    {format(run.peak_power_kw)}
                  </p>
                  {run.peak_power_rpm != null && (
                    <p className="text-zinc-600 text-[11px] mt-0.5">@ {run.peak_power_rpm.toFixed(0)} RPM</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
