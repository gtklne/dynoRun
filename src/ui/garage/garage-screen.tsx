import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { runRepository } from '@/api/repositories/run-repository';
import { useUnits } from '@/app/units-context';
import type { Run, Vehicle } from '@/shared/types';
import { VehicleForm } from './vehicle-form';

interface VehicleStats {
  runCount: number;
  bestPeakKw: number | null;
}

function statsFor(runs: Run[]): VehicleStats {
  const complete = runs.filter((r) => r.status === 'complete');
  let bestPeakKw: number | null = null;
  for (const r of complete) {
    if (r.peak_power_kw == null) continue;
    if (bestPeakKw === null || r.peak_power_kw > bestPeakKw) {
      bestPeakKw = r.peak_power_kw;
    }
  }
  return { runCount: complete.length, bestPeakKw };
}

function VehicleCard({ vehicle, stats }: { vehicle: Vehicle; stats: VehicleStats }) {
  const { format } = useUnits();
  return (
    <Link to={`/vehicles/${vehicle.id}`} className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-zinc-100 font-semibold text-base truncate">{vehicle.name}</p>
          <p className="text-zinc-500 text-sm mt-0.5 capitalize">
            {vehicle.kind} · {vehicle.mass_kg} kg · {vehicle.drivetrain.toUpperCase()}
          </p>
          {vehicle.notes && (
            <p className="text-zinc-600 text-xs mt-1 truncate">{vehicle.notes}</p>
          )}
          <p className="text-amber-400 text-xs font-mono mt-2 tabular-nums">
            {stats.runCount === 0
              ? 'No runs yet'
              : `${stats.runCount} run${stats.runCount === 1 ? '' : 's'} · best ${format(stats.bestPeakKw)}`}
          </p>
        </div>
        <svg className="text-zinc-600 shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    </Link>
  );
}

function OnboardingCard() {
  const steps = [
    'Add your vehicle (mass matters — physics is F=ma)',
    'Calibrate a gear (drive at known RPM to capture your speed/RPM ratio)',
    'Drive and record (the app derives your power curve from GPS acceleration)',
  ];
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
      <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest">How it works</p>
      <ol className="space-y-3">
        {steps.map((text, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="bg-amber-500/15 text-amber-400 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0">
              {i + 1}
            </span>
            <span className="text-zinc-300 text-sm leading-6">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GarageScreen() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [runsByVehicle, setRunsByVehicle] = useState<Map<string, Run[]>>(new Map());
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const list = await vehicleRepository.list();
    const runsList = await Promise.all(list.map((v) => runRepository.listByVehicle(v.id)));
    const map = new Map<string, Run[]>();
    list.forEach((v, i) => map.set(v.id, runsList[i] ?? []));
    setRunsByVehicle(map);
    setVehicles(list);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (vehicles === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Garage</h1>
        {!adding && vehicles.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold text-sm px-4 py-2 rounded-xl transition-colors"
          >
            Add vehicle
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">New vehicle</p>
          <VehicleForm
            onSubmit={async (input) => {
              await vehicleRepository.create(input);
              setAdding(false);
              await reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {vehicles.length === 0 && !adding && (
        <>
          <OnboardingCard />
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-zinc-500 text-sm">No vehicles yet.</p>
            <button
              onClick={() => setAdding(true)}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              Add vehicle
            </button>
          </div>
        </>
      )}

      <div className="space-y-2">
        {vehicles.map((v) => (
          <VehicleCard key={v.id} vehicle={v} stats={statsFor(runsByVehicle.get(v.id) ?? [])} />
        ))}
      </div>
    </div>
  );
}
