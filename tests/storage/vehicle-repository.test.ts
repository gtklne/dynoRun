import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import type { Database } from '@/storage/database';

describe('VehicleRepository', () => {
  let db: Database;
  let repo: VehicleRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    repo = new VehicleRepository(db);
  });

  it('creates and reads a vehicle', async () => {
    const v = await repo.create({
      name: 'Civic',
      kind: 'car',
      mass_kg: 1300,
      drivetrain: 'fwd',
      frontal_area_m2: null,
      drag_coefficient: null,
      notes: '',
    });
    expect(v.id).toMatch(/[0-9a-f-]+/);
    const got = await repo.get(v.id);
    expect(got?.name).toBe('Civic');
    expect(got?.mass_kg).toBe(1300);
  });

  it('lists vehicles ordered by name', async () => {
    await repo.create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    await repo.create({ name: 'Aprilia', kind: 'motorcycle', mass_kg: 200, drivetrain: 'chain', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const list = await repo.list();
    expect(list.map((v) => v.name)).toEqual(['Aprilia', 'Civic']);
  });

  it('updates a vehicle and bumps updated_at', async () => {
    const v = await repo.create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const before = v.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(v.id, { mass_kg: 1350 });
    expect(updated.mass_kg).toBe(1350);
    expect(updated.updated_at > before).toBe(true);
  });

  it('deletes a vehicle', async () => {
    const v = await repo.create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    await repo.delete(v.id);
    expect(await repo.get(v.id)).toBeNull();
  });
});
