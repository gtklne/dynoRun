import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import type { Vehicle } from '@/shared/types';
import { VehicleForm } from './vehicle-form';

export function GarageScreen() {
  const db = useDatabase();
  const repo = new VehicleRepository(db);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    setVehicles(await repo.list());
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (vehicles === null) return <p>Loading…</p>;

  return (
    <section>
      <h1>Garage</h1>
      {vehicles.length === 0 && !adding && <p>No vehicles yet.</p>}
      <ul>
        {vehicles.map((v) => (
          <li key={v.id}>
            <Link to={`/vehicles/${v.id}`}>{v.name}</Link> — {v.kind}, {v.mass_kg} kg
          </li>
        ))}
      </ul>
      {adding ? (
        <VehicleForm
          onSubmit={async (input) => {
            await repo.create(input);
            setAdding(false);
            await reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button onClick={() => setAdding(true)}>Add vehicle</button>
      )}
    </section>
  );
}
