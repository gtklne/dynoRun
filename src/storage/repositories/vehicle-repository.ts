import type { Database } from '../database';
import type { Vehicle, VehicleKind, Drivetrain } from '@/shared/types';
import { newId } from '@/shared/uuid';
import { nowIso } from '@/shared/iso-time';

export interface NewVehicle {
  name: string;
  kind: VehicleKind;
  mass_kg: number;
  drivetrain: Drivetrain;
  frontal_area_m2: number | null;
  drag_coefficient: number | null;
  notes: string;
}

export class VehicleRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewVehicle): Promise<Vehicle> {
    const id = newId();
    const now = nowIso();
    const v: Vehicle = {
      id,
      user_id: null,
      ...input,
      created_at: now,
      updated_at: now,
      synced_at: null,
    };
    await this.db.execute(
      `INSERT INTO vehicles
        (id, user_id, name, kind, mass_kg, drivetrain, frontal_area_m2, drag_coefficient, notes, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.id, v.user_id, v.name, v.kind, v.mass_kg, v.drivetrain, v.frontal_area_m2, v.drag_coefficient, v.notes, v.created_at, v.updated_at, v.synced_at],
    );
    return v;
  }

  async get(id: string): Promise<Vehicle | null> {
    const rows = await this.db.query<Vehicle>('SELECT * FROM vehicles WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async list(): Promise<Vehicle[]> {
    return this.db.query<Vehicle>('SELECT * FROM vehicles ORDER BY name');
  }

  async update(id: string, patch: Partial<NewVehicle>): Promise<Vehicle> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`vehicle not found: ${id}`);
    const merged: Vehicle = {
      ...existing,
      ...patch,
      updated_at: nowIso(),
    };
    await this.db.execute(
      `UPDATE vehicles SET
         name = ?, kind = ?, mass_kg = ?, drivetrain = ?,
         frontal_area_m2 = ?, drag_coefficient = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [merged.name, merged.kind, merged.mass_kg, merged.drivetrain, merged.frontal_area_m2, merged.drag_coefficient, merged.notes, merged.updated_at, id],
    );
    return merged;
  }

  async delete(id: string): Promise<void> {
    await this.db.execute('DELETE FROM vehicles WHERE id = ?', [id]);
  }
}
