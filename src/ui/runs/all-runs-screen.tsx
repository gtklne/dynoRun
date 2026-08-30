import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { runRepository } from '@/api/repositories/run-repository';
import type { Vehicle, Run, RunStatus } from '@/shared/types';
import { formatRelativeTime } from '@/shared/format-time';
import { useUnits } from '@/app/units-context';
import { SegmentedControl } from '@/ui/components/segmented-control';
import {
  Advisory,
  MinimaTable,
  Na,
  PlateButton,
  PlateLink,
  TitleBlock,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';

interface RowVm {
  run: Run;
  vehicle: Vehicle | null;
}

type SortKey = 'newest' | 'peak';
const ALL_VEHICLES = '__all__';

// Hide filter/sort UI for tiny lists: adds clutter without value.
const FILTER_UI_THRESHOLD = 5;

const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'peak', label: 'Highest peak' },
];

const STATUS_LABEL: Record<RunStatus, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  degraded: 'Degraded',
  aborted: 'Aborted',
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

function ClearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

interface VehicleChipsProps {
  vehicles: Vehicle[];
  counts: Map<string, number>;
  totalCount: number;
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * The vehicle filter is a ruled strip of cells, one frame around the lot, so it
 * reads as one instrument control rather than a scattering of pills. Selection
 * inverts to solid ink, the same state language every other control uses.
 */
function VehicleChips({ vehicles, counts, totalCount, selectedId, onSelect }: VehicleChipsProps) {
  const shown = vehicles.filter((v) => (counts.get(v.id) ?? 0) > 0);
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        role="tablist"
        aria-label="Filter by vehicle"
        className="box-frame inline-flex"
        style={{ isolation: 'isolate' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedId === ALL_VEHICLES}
          data-active={selectedId === ALL_VEHICLES}
          onClick={() => onSelect(ALL_VEHICLES)}
          className="ctl border-0"
          style={{ minHeight: 36, padding: '0.25rem 0.75rem', fontSize: '0.6875rem' }}
        >
          All <span className="tabular-nums">· {totalCount}</span>
        </button>
        {shown.map((v) => {
          const count = counts.get(v.id) ?? 0;
          const active = selectedId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-active={active}
              onClick={() => onSelect(v.id)}
              className="ctl rule-l border-0"
              style={{ minHeight: 36, padding: '0.25rem 0.75rem', fontSize: '0.6875rem' }}
            >
              <span className="inline-block max-w-[10rem] truncate align-bottom">{v.name}</span>
              <span className="tabular-nums"> · {count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AllRunsScreen() {
  const navigate = useNavigate();
  const { format } = useUnits();
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

  const columns: MinimaColumn<RowVm>[] = [
    {
      key: 'run',
      head: 'Run',
      cell: ({ run, vehicle }) => (
        <span className="block min-w-0">
          <span className="t-data block truncate text-sm">
            {run.title ?? `${vehicle?.name ?? 'Unknown vehicle'} / ${run.gear_label}`}
          </span>
          <span className="t-annotation mt-1 block truncate">
            {vehicle?.name ?? 'Unknown vehicle'} / {run.gear_label}
          </span>
        </span>
      ),
    },
    {
      key: 'when',
      head: 'When',
      cell: ({ run }) => formatRelativeTime(run.started_at),
    },
    {
      key: 'peak',
      head: 'Peak',
      numeric: true,
      cell: ({ run }) =>
        run.peak_power_kw == null ? <Na title="No peak recorded" /> : format(run.peak_power_kw),
    },
    {
      key: 'rpm',
      head: 'At RPM',
      numeric: true,
      cell: ({ run }) =>
        run.peak_power_rpm == null ? (
          <Na title="Peak RPM not recorded" />
        ) : (
          run.peak_power_rpm.toFixed(0)
        ),
    },
    {
      key: 'status',
      head: 'Status',
      cell: ({ run }) => STATUS_LABEL[run.status],
    },
    {
      key: 'sheet',
      head: 'Sheet',
      cell: ({ run }) => (
        <Link
          to={`/runs/${run.id}/review`}
          className="t-label no-underline hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Review
        </Link>
      ),
    },
  ];

  if (rows === null && !error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="t-annotation">Loading…</p>
      </div>
    );
  }

  return (
    <div className="plate-stack">
      <TitleBlock
        title="Runs"
        meta={[
          { label: 'Complete runs', value: totalCount },
          { label: 'Vehicles', value: distinctVehicles.length },
          { label: 'Showing', value: visible.length },
          { label: 'Sorted by', value: sort === 'peak' ? 'Highest peak' : 'Newest' },
        ]}
      />

      {error && <Advisory>{error}</Advisory>}

      {totalCount === 0 && !error && (
        <Zone label="Run log">
          <div className="hatch px-3 py-10 text-center">
            <p className="t-label" style={{ color: 'var(--color-ink)' }}>
              Start your first run
            </p>
            <p className="t-annotation mx-auto mt-2 max-w-sm">
              Add a vehicle and calibrate a gear to record your power curve.
            </p>
            <div className="mt-4 flex justify-center">
              <PlateLink to="/garage" variant="procedure">
                Go to garage
              </PlateLink>
            </div>
          </div>
        </Zone>
      )}

      {totalCount > 0 && (
        <div>
          {showFilters && (
            <div
              className="sticky top-0 z-10 -mx-4 space-y-3 px-4 pb-3 pt-2 lg:mx-0 lg:px-0"
              style={{ background: 'var(--color-sheet)' }}
            >
              <div className="flex items-stretch">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title"
                  aria-label="Search runs by title"
                  className="field"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="ctl shrink-0 px-3"
                    style={{ borderLeft: 'none', minHeight: 44 }}
                  >
                    <ClearIcon />
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

              <div className="flex flex-wrap items-center justify-between gap-2">
                <SegmentedControl
                  options={SORT_OPTIONS}
                  value={sort}
                  onChange={setSort}
                  ariaLabel="Sort runs"
                  compact
                />
                {filtersActive && (
                  <button type="button" onClick={clearFilters} className="t-label hover:underline">
                    Reset
                  </button>
                )}
              </div>
            </div>
          )}

          <Zone
            label="Run log"
            note={
              visible.length === totalCount
                ? `${totalCount} complete run${totalCount === 1 ? '' : 's'} across all vehicles`
                : `${visible.length} of ${totalCount} shown`
            }
            className="mt-4"
          >
            {visible.length === 0 ? (
              <div className="hatch px-3 py-10 text-center">
                <p className="t-label" style={{ color: 'var(--color-ink)' }}>
                  No runs match your filters
                </p>
                <div className="mt-4 flex justify-center">
                  <PlateButton onClick={clearFilters}>Clear filters</PlateButton>
                </div>
              </div>
            ) : (
              <MinimaTable
                columns={columns}
                rows={visible}
                rowKey={({ run }) => run.id}
                onSelect={({ run }) => navigate(`/runs/${run.id}/review`)}
              />
            )}
          </Zone>
        </div>
      )}
    </div>
  );
}
