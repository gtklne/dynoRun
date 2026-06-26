import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { runRepository } from '@/api/repositories/run-repository';
import type { Vehicle, Run, RunStatus } from '@/shared/types';
import { formatRelativeTime } from '@/shared/format-time';
import { useUnits } from '@/app/units-context';
import { SegmentedControl } from '@/ui/components/segmented-control';

interface RowVm {
  run: Run;
  vehicle: Vehicle | null;
}

type SortKey = 'newest' | 'peak';
const ALL_VEHICLES = '__all__';

// Hide filter/sort UI for tiny lists — adds clutter without value.
const FILTER_UI_THRESHOLD = 5;

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'peak', label: 'Highest peak' },
];

interface StatusTone {
  dot: string;
  label: string;
}

const STATUS_TONES: Record<RunStatus, StatusTone> = {
  complete: { dot: 'bg-emerald-400', label: 'Complete' },
  in_progress: { dot: 'bg-sky-400', label: 'In progress' },
  degraded: { dot: 'bg-amber-400', label: 'Degraded' },
  aborted: { dot: 'bg-red-400', label: 'Aborted' },
};

function vehicleCounts(rows: RowVm[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { run } of rows) {
    counts.set(run.vehicle_id, (counts.get(run.vehicle_id) ?? 0) + 1);
  }
  return counts;
}

function filterAndSort(
  rows: RowVm[],
  vehicleId: string,
  search: string,
  sort: SortKey,
): RowVm[] {
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(({ run }) => {
    if (vehicleId !== ALL_VEHICLES && run.vehicle_id !== vehicleId) return false;
    if (needle && !(run.title ?? '').toLowerCase().includes(needle)) return false;
    return true;
  });

  if (sort === 'peak') {
    return filtered.slice().sort((a, b) => {
      const ap = a.run.peak_power_kw;
      const bp = b.run.peak_power_kw;
      if (ap == null && bp == null) return b.run.started_at.localeCompare(a.run.started_at);
      if (ap == null) return 1;
      if (bp == null) return -1;
      if (bp !== ap) return bp - ap;
      return b.run.started_at.localeCompare(a.run.started_at);
    });
  }

  return filtered.slice().sort((a, b) => b.run.started_at.localeCompare(a.run.started_at));
}

interface VehicleChipsProps {
  vehicles: Vehicle[];
  counts: Map<string, number>;
  totalCount: number;
  selectedId: string;
  onSelect: (id: string) => void;
}

function VehicleChips({ vehicles, counts, totalCount, selectedId, onSelect }: VehicleChipsProps) {
  const chipClass = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
      active
        ? 'bg-amber-500 text-zinc-950 border-amber-500'
        : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-zinc-100'
    }`;
  return (
    <div
      role="tablist"
      aria-label="Filter by vehicle"
      className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={selectedId === ALL_VEHICLES}
        onClick={() => onSelect(ALL_VEHICLES)}
        className={chipClass(selectedId === ALL_VEHICLES)}
      >
        All <span className="opacity-70 tabular-nums">· {totalCount}</span>
      </button>
      {vehicles.map((v) => {
        const count = counts.get(v.id) ?? 0;
        if (count === 0) return null;
        const active = selectedId === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(v.id)}
            className={chipClass(active)}
          >
            <span className="truncate max-w-[10rem] inline-block align-bottom">{v.name}</span>
            <span className="opacity-70 tabular-nums"> · {count}</span>
          </button>
        );
      })}
    </div>
  );
}

interface RunRowProps {
  row: RowVm;
}

function RunRow({ row }: RunRowProps) {
  const { format } = useUnits();
  const { run, vehicle } = row;
  const status = STATUS_TONES[run.status];
  return (
    <Link
      to={`/runs/${run.id}/review`}
      className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`}
              aria-label={status.label}
              title={status.label}
            />
            <p className="text-zinc-100 font-medium text-sm truncate">
              {run.title ?? `${vehicle?.name ?? 'Unknown vehicle'} · ${run.gear_label}`}
            </p>
          </div>
          <p className="text-zinc-500 text-xs mt-0.5 truncate">
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
  );
}

export function AllRunsScreen() {
  const [rows, setRows] = useState<RowVm[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [vehicleFilter, setVehicleFilter] = useState<string>(ALL_VEHICLES);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vs = await vehicleRepository.list();
        const byId = new Map(vs.map((v) => [v.id, v]));
        const lists = await Promise.all(vs.map((v) => runRepository.listByVehicle(v.id)));
        const flat: RowVm[] = lists
          .flat()
          .filter((r) => r.status === 'complete')
          .map((r) => ({ run: r, vehicle: byId.get(r.vehicle_id) ?? null }));
        if (!cancelled) {
          setVehicles(vs);
          setRows(flat);
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalCount = rows?.length ?? 0;
  const counts = useMemo(() => vehicleCounts(rows ?? []), [rows]);
  const visible = useMemo(
    () => (rows ? filterAndSort(rows, vehicleFilter, search, sort) : []),
    [rows, vehicleFilter, search, sort],
  );

  const showFilters = totalCount >= FILTER_UI_THRESHOLD;
  const distinctVehicles = useMemo(
    () => vehicles.filter((v) => (counts.get(v.id) ?? 0) > 0),
    [vehicles, counts],
  );
  const showChips = distinctVehicles.length >= 2;

  const filtersActive =
    vehicleFilter !== ALL_VEHICLES || search.trim().length > 0 || sort !== 'newest';

  const clearFilters = () => {
    setVehicleFilter(ALL_VEHICLES);
    setSearch('');
    setSort('newest');
  };

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
          {totalCount === 0
            ? 'No complete runs yet.'
            : `${totalCount} complete run${totalCount === 1 ? '' : 's'} across all vehicles`}
        </p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-3">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {totalCount === 0 && !error && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-3">
          <p className="text-zinc-300 text-sm font-medium">Start your first run</p>
          <p className="text-zinc-500 text-xs">
            Add a vehicle and calibrate a gear to record your power curve.
          </p>
          <Link
            to="/"
            className="inline-block bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            Go to garage
          </Link>
        </div>
      )}

      {totalCount > 0 && showFilters && (
        <div className="sticky top-0 z-10 -mx-4 px-4 lg:mx-0 lg:px-0 pt-2 pb-3 bg-zinc-950/95 backdrop-blur border-b border-zinc-900 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title"
              aria-label="Search runs by title"
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 focus:outline-none rounded-xl text-zinc-100 text-sm px-3 py-2 pr-9 placeholder:text-zinc-600"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 px-3 text-zinc-500 hover:text-zinc-200 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>

          {showChips && (
            <VehicleChips
              vehicles={distinctVehicles}
              counts={counts}
              totalCount={totalCount}
              selectedId={vehicleFilter}
              onSelect={setVehicleFilter}
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <SegmentedControl
              options={SORT_OPTIONS}
              value={sort}
              onChange={setSort}
              ariaLabel="Sort runs"
              compact
            />
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-zinc-500 hover:text-zinc-200 text-xs font-medium"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {totalCount > 0 && visible.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-3">
          <p className="text-zinc-300 text-sm">No runs match your filters</p>
          <button
            type="button"
            onClick={clearFilters}
            className="text-amber-400 hover:text-amber-300 text-xs font-semibold underline underline-offset-4"
          >
            Clear filters
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <div className="space-y-2 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:space-y-0">
          {visible.map((row) => (
            <RunRow key={row.run.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
