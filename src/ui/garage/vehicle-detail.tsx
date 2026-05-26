import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { runRepository } from '@/api/repositories/run-repository';
import { useUnits } from '@/app/units-context';
import { formatRelativeTime } from '@/shared/format-time';
import { PeakTrendChart } from '@/ui/components/peak-trend-chart';
import type { Vehicle, Calibration, Run, Transmission } from '@/shared/types';
import { VehicleForm } from './vehicle-form';

const statusColor: Record<string, string> = {
  complete: 'text-emerald-400',
  in_progress: 'text-amber-400',
  degraded: 'text-orange-400',
  aborted: 'text-zinc-500',
};

const TRANSMISSION_LABEL: Record<Transmission, string> = {
  manual: 'Manual',
  dct: 'DCT',
  automatic: 'Automatic',
  cvt: 'CVT',
};

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
      <p className="text-zinc-500 text-[10px] uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold mt-1 tabular-nums ${accent ? 'text-amber-400' : 'text-zinc-100'}`}>
        {value}
      </p>
    </div>
  );
}

function heroLine(vehicle: Vehicle): string {
  const parts: string[] = [];
  if (vehicle.year != null) parts.push(String(vehicle.year));
  if (vehicle.make) parts.push(vehicle.make);
  if (vehicle.model) parts.push(vehicle.model);
  return parts.length > 0 ? parts.join(' ') : vehicle.name;
}

function secondaryParts(vehicle: Vehicle): string[] {
  const parts: string[] = [];
  if (vehicle.tire_label) parts.push(vehicle.tire_label);
  if (vehicle.transmission) parts.push(TRANSMISSION_LABEL[vehicle.transmission]);
  if (vehicle.power_hp_factory != null) parts.push(`factory ~${vehicle.power_hp_factory} hp`);
  return parts;
}

function VehicleProfileCard({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  const showHero = vehicle.make || vehicle.model || vehicle.year != null;
  const hero = heroLine(vehicle);
  const secondary = secondaryParts(vehicle);
  const showSubName = showHero && vehicle.name && vehicle.name !== hero;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-zinc-100 truncate">{hero}</h1>
          {showSubName && (
            <p className="text-zinc-400 text-sm mt-0.5 truncate">{vehicle.name}</p>
          )}
          {secondary.length > 0 && (
            <p className="text-zinc-400 text-sm mt-1.5">{secondary.join(' · ')}</p>
          )}
          <p className="text-zinc-500 text-xs mt-1 capitalize">
            {vehicle.mass_kg} kg · {vehicle.drivetrain.toUpperCase()} · {vehicle.kind}
          </p>
          {vehicle.notes && (
            <p className="text-zinc-600 text-sm mt-2">{vehicle.notes}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-amber-400 hover:text-amber-300 text-xs font-semibold transition-colors shrink-0"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [editing, setEditing] = useState(false);
  const { format } = useUnits();

  useEffect(() => {
    if (!id) return;
    (async () => {
      setVehicle(await vehicleRepository.get(id));
      setCals(await calibrationRepository.listByVehicle(id));
      setRuns(await runRepository.listByVehicle(id));
    })();
  }, [id]);

  if (!vehicle) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  const completeRuns = runs.filter((r) => r.status === 'complete');
  const bestPeak = completeRuns.reduce<number | null>((acc, r) => {
    if (r.peak_power_kw == null) return acc;
    return acc === null || r.peak_power_kw > acc ? r.peak_power_kw : acc;
  }, null);
  const mostRecent = runs.length > 0
    ? runs.reduce((a, b) => (new Date(a.started_at).getTime() >= new Date(b.started_at).getTime() ? a : b))
    : null;

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <Link to="/" className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 text-sm transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Garage
      </Link>

      {/* Profile card / edit form */}
      {editing ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">Edit vehicle</p>
          <VehicleForm
            initial={vehicle}
            onSubmit={async (input) => {
              const updated = await vehicleRepository.update(vehicle.id, input);
              setVehicle(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <VehicleProfileCard vehicle={vehicle} onEdit={() => setEditing(true)} />
      )}

      {/* Vehicle stats */}
      {!editing && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Runs" value={completeRuns.length} />
          <Stat label="Best power" value={format(bestPeak)} accent />
          <Stat label="Last run" value={mostRecent ? formatRelativeTime(mostRecent.started_at) : '—'} />
        </div>
      )}

      {/* Calibrations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            Calibrations ({cals.length})
          </p>
          <Link
            to={`/vehicles/${vehicle.id}/calibrations/new`}
            className="text-amber-400 hover:text-amber-300 text-xs font-semibold transition-colors"
          >
            + New
          </Link>
        </div>

        {cals.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-600 text-sm text-center py-2">No calibrations yet. Add one to start a run.</p>
          </div>
        )}

        {cals.map((c) => (
          <div key={c.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-zinc-100 font-medium text-sm">{c.gear_label}</p>
              <p className="text-zinc-500 text-xs mt-0.5">
                {c.rpm.toFixed(0)} RPM @ {c.speed_kmh.toFixed(1)} km/h
              </p>
            </div>
            <Link
              to={`/vehicles/${vehicle.id}/calibrations/${c.id}/run`}
              className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold text-xs px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              New run
            </Link>
          </div>
        ))}
      </div>

      {/* Compare shortcut */}
      {completeRuns.length >= 2 && (
        <Link
          to={`/vehicles/${vehicle.id}/compare`}
          className="flex items-center justify-between bg-zinc-900 border border-amber-800/40 rounded-2xl p-4 hover:border-amber-700/60 transition-colors"
        >
          <div>
            <p className="text-amber-400 font-semibold text-sm">Compare runs</p>
            <p className="text-zinc-500 text-xs mt-0.5">{completeRuns.length} complete runs available</p>
          </div>
          <svg className="text-amber-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>
      )}

      {/* Peak power trend */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          Peak power trend
        </p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <PeakTrendChart
            runs={runs}
            onSelectRun={(runId) => navigate(`/runs/${runId}/review`)}
          />
        </div>
      </div>

      {/* Runs history */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          Runs ({runs.length})
        </p>

        {runs.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-600 text-sm text-center py-2">No runs yet.</p>
          </div>
        )}

        {runs.map((r) => {
          const showPeak = r.status === 'complete' && r.peak_power_kw != null;
          return (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-zinc-100 text-sm font-medium truncate">{r.title ?? r.gear_label}</p>
                <p className="text-zinc-500 text-xs mt-0.5 truncate">
                  {formatRelativeTime(r.started_at)} · {r.gear_label}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <p className="tabular-nums text-amber-400 text-sm font-semibold">
                  {showPeak ? format(r.peak_power_kw) : '—'}
                </p>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium capitalize ${statusColor[r.status] ?? 'text-zinc-400'}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  {r.status === 'complete' && (
                    <Link
                      to={`/runs/${r.id}/review`}
                      className="text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
                    >
                      Review
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
