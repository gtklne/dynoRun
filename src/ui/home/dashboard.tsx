import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { runRepository } from '@/api/repositories/run-repository';
import { useUnits } from '@/app/units-context';
import { formatRelativeTime } from '@/shared/format-time';
import { StatTile } from '@/ui/components/stat-tile';
import type { Run, Vehicle } from '@/shared/types';

// Shared DynoRun dashboard data + widgets, used by both the DynoRun home
// (GarageScreen) and the cross-tool system home (SystemHome).

export interface PeakInfo {
  kw: number;
  vehicleName: string;
}

export interface RecentRow {
  run: Run;
  vehicleName: string;
}

export interface DashboardData {
  peak: PeakInfo | null;
  totalRuns: number;
  recent: RecentRow[];
}

export function computeDashboard(vehicles: Vehicle[], runsByVehicle: Map<string, Run[]>): DashboardData {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const completeRuns: Run[] = [];
  for (const list of runsByVehicle.values()) {
    for (const r of list) {
      if (r.status === 'complete') completeRuns.push(r);
    }
  }

  let peak: PeakInfo | null = null;
  for (const r of completeRuns) {
    if (r.peak_power_kw == null) continue;
    if (peak === null || r.peak_power_kw > peak.kw) {
      const vName = byId.get(r.vehicle_id)?.name ?? 'Unknown vehicle';
      peak = { kw: r.peak_power_kw, vehicleName: vName };
    }
  }

  const recent = completeRuns
    .slice()
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 5)
    .map((r) => ({
      run: r,
      vehicleName: byId.get(r.vehicle_id)?.name ?? 'Unknown vehicle',
    }));

  return { peak, totalRuns: completeRuns.length, recent };
}

/** Loads vehicles + their runs. `vehicles === null` until the first load resolves. */
export function useGarageData() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [runsByVehicle, setRunsByVehicle] = useState<Map<string, Run[]>>(new Map());

  const reload = useCallback(async () => {
    const list = await vehicleRepository.list();
    const runsList = await Promise.all(list.map((v) => runRepository.listByVehicle(v.id)));
    const map = new Map<string, Run[]>();
    list.forEach((v, i) => map.set(v.id, runsList[i] ?? []));
    setRunsByVehicle(map);
    setVehicles(list);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { vehicles, runsByVehicle, setVehicles, setRunsByVehicle, reload };
}

export function HeroStats({ peak, totalRuns, vehicleCount }: { peak: PeakInfo | null; totalRuns: number; vehicleCount: number }) {
  const { format } = useUnits();
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatTile label="All-time peak" value={peak ? format(peak.kw) : '—'} subtitle={peak?.vehicleName} accent />
      <StatTile label="Total runs" value={String(totalRuns)} />
      <StatTile label="Cars" value={String(vehicleCount)} subtitle="in garage" />
    </div>
  );
}

export function RecentActivity({ rows }: { rows: RecentRow[] }) {
  const { format } = useUnits();
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Recent activity</p>
      <div className="space-y-2">
        {rows.map(({ run, vehicleName }) => {
          const title = run.title ?? `${run.gear_label} · ${formatRelativeTime(run.started_at)}`;
          return (
            <Link
              key={run.id}
              to={`/runs/${run.id}/review`}
              className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-400 text-xs truncate">{vehicleName}</p>
                  <p className="text-zinc-100 text-sm font-medium mt-0.5 truncate">{title}</p>
                </div>
                <p className="tabular-nums text-amber-400 text-sm font-semibold shrink-0">{format(run.peak_power_kw)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
