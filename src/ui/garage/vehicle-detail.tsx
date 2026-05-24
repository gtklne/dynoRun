import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import type { Vehicle, Calibration, Run } from '@/shared/types';

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const db = useDatabase();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    if (!id) return;
    const vehicles = new VehicleRepository(db);
    const calRepo = new CalibrationRepository(db);
    const runRepo = new RunRepository(db);
    (async () => {
      setVehicle(await vehicles.get(id));
      setCals(await calRepo.listByVehicle(id));
      setRuns(await runRepo.listByVehicle(id));
    })();
  }, [id, db]);

  if (!vehicle) return <p>Loading…</p>;

  return (
    <section>
      <p><Link to="/">← Garage</Link></p>
      <h1>{vehicle.name}</h1>
      <p>{vehicle.kind}, {vehicle.mass_kg} kg, {vehicle.drivetrain}</p>
      <h2>Calibrations ({cals.length})</h2>
      <ul>{cals.map((c) => <li key={c.id}>{c.gear_label}: {c.rpm} RPM @ {c.speed_kmh} km/h (rollout {c.rollout_m_per_rev.toFixed(4)} m/rev)</li>)}</ul>
      <h2>Runs ({runs.length})</h2>
      <ul>{runs.map((r) => <li key={r.id}>{r.started_at} — {r.gear_label} — {r.status}</li>)}</ul>
      <p><em>Calibration wizard and live runs ship in Plan 2.</em></p>
    </section>
  );
}
