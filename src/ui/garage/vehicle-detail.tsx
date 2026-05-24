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
    (async () => {
      setVehicle(await new VehicleRepository(db).get(id));
      setCals(await new CalibrationRepository(db).listByVehicle(id));
      setRuns(await new RunRepository(db).listByVehicle(id));
    })();
  }, [id, db]);

  if (!vehicle) return <p>Loading…</p>;

  return (
    <section>
      <p><Link to="/">← Garage</Link></p>
      <h1>{vehicle.name}</h1>
      <p>{vehicle.kind}, {vehicle.mass_kg} kg, {vehicle.drivetrain}</p>

      <h2>Calibrations ({cals.length})</h2>
      <ul>
        {cals.map((c) => (
          <li key={c.id}>
            {c.gear_label}: {c.rpm} RPM @ {c.speed_kmh.toFixed(1)} km/h{' '}
            <Link to={`/vehicles/${vehicle.id}/calibrations/${c.id}/run`}>New run</Link>
          </li>
        ))}
      </ul>
      <p><Link to={`/vehicles/${vehicle.id}/calibrations/new`}>+ New calibration</Link></p>

      <h2>Runs ({runs.length})</h2>
      <ul>
        {runs.map((r) => (
          <li key={r.id}>
            {r.started_at} — {r.gear_label} — {r.status}{' '}
            {r.status !== 'aborted' && <Link to={`/runs/${r.id}/review`}>review</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
