import type { Database } from '../database';
import type { Calibration } from '@/shared/types';
import { newId } from '@/shared/uuid';
import { nowIso } from '@/shared/iso-time';
import { kmhToMps } from '@/shared/units';

export interface NewCalibration {
  vehicle_id: string;
  gear_label: string;
  rpm: number;
  speed_kmh: number;
  notes: string;
}

export class CalibrationRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewCalibration): Promise<Calibration> {
    const id = newId();
    const now = nowIso();
    const rollout = computeRollout(input.rpm, input.speed_kmh);
    const c: Calibration = {
      id,
      user_id: null,
      vehicle_id: input.vehicle_id,
      gear_label: input.gear_label,
      rpm: input.rpm,
      speed_kmh: input.speed_kmh,
      rollout_m_per_rev: rollout,
      recorded_at: now,
      notes: input.notes,
      created_at: now,
      updated_at: now,
      synced_at: null,
    };
    await this.db.execute(
      `INSERT INTO calibrations
        (id, user_id, vehicle_id, gear_label, rpm, speed_kmh, rollout_m_per_rev, recorded_at, notes, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.user_id, c.vehicle_id, c.gear_label, c.rpm, c.speed_kmh, c.rollout_m_per_rev, c.recorded_at, c.notes, c.created_at, c.updated_at, c.synced_at],
    );
    return c;
  }

  async get(id: string): Promise<Calibration | null> {
    const rows = await this.db.query<Calibration>('SELECT * FROM calibrations WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async listByVehicle(vehicleId: string): Promise<Calibration[]> {
    const rows = await this.db.query<Calibration>(
      'SELECT * FROM calibrations WHERE vehicle_id = ? ORDER BY created_at DESC',
      [vehicleId],
    );
    return rows;
  }

  async delete(id: string): Promise<void> {
    await this.db.execute('DELETE FROM calibrations WHERE id = ?', [id]);
  }
}

export function computeRollout(rpm: number, speedKmh: number): number {
  return kmhToMps(speedKmh) / (rpm / 60);
}
