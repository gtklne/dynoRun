import type { Database } from '../database';
import type { Run, RunConditions, RunStatus } from '@/shared/types';
import { newId } from '@/shared/uuid';
import { nowIso } from '@/shared/iso-time';

export interface NewRun {
  vehicle_id: string;
  calibration_id: string;
  gear_label: string;
  conditions: RunConditions;
  notes: string;
}

interface RunRow extends Omit<Run, 'conditions'> {
  conditions: string;
}

export class RunRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewRun): Promise<Run> {
    const id = newId();
    const now = nowIso();
    const r: Run = {
      id,
      user_id: null,
      vehicle_id: input.vehicle_id,
      calibration_id: input.calibration_id,
      started_at: now,
      ended_at: null,
      gear_label: input.gear_label,
      conditions: input.conditions,
      notes: input.notes,
      status: 'complete',
      created_at: now,
      updated_at: now,
      synced_at: null,
    };
    await this.db.execute(
      `INSERT INTO runs
        (id, user_id, vehicle_id, calibration_id, started_at, ended_at, gear_label, conditions, notes, status, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.user_id, r.vehicle_id, r.calibration_id, r.started_at, r.ended_at, r.gear_label, JSON.stringify(r.conditions), r.notes, r.status, r.created_at, r.updated_at, r.synced_at],
    );
    return r;
  }

  async get(id: string): Promise<Run | null> {
    const rows = await this.db.query('SELECT * FROM runs WHERE id = ?', [id]);
    if (!rows[0]) return null;
    const row = rows[0] as unknown as RunRow;
    return { ...row, conditions: JSON.parse(row.conditions) };
  }

  async listByVehicle(vehicleId: string): Promise<Run[]> {
    const rows = await this.db.query(
      'SELECT * FROM runs WHERE vehicle_id = ? ORDER BY started_at DESC',
      [vehicleId],
    );
    return (rows as unknown as RunRow[]).map((r) => ({ ...r, conditions: JSON.parse(r.conditions) }));
  }

  async markDegraded(id: string): Promise<void> {
    await this.setStatus(id, 'degraded');
  }

  async markAborted(id: string): Promise<void> {
    await this.setStatus(id, 'aborted');
  }

  async finalize(id: string, endedAt: string): Promise<void> {
    await this.db.execute(
      'UPDATE runs SET ended_at = ?, updated_at = ? WHERE id = ?',
      [endedAt, nowIso(), id],
    );
  }

  private async setStatus(id: string, status: RunStatus): Promise<void> {
    await this.db.execute(
      'UPDATE runs SET status = ?, updated_at = ? WHERE id = ?',
      [status, nowIso(), id],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.execute('DELETE FROM runs WHERE id = ?', [id]);
  }
}
