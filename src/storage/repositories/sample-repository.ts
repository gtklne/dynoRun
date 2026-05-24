import type { Database } from '../database';
import type { Sample } from '@/shared/types';

export class SampleRepository {
  constructor(private readonly db: Database) {}

  async insertMany(samples: Sample[]): Promise<void> {
    if (samples.length === 0) return;
    await this.db.transaction(async () => {
      for (const s of samples) {
        await this.db.execute(
          `INSERT INTO samples (run_id, t_ms, speed_mps, accel_long_ms2, accel_vert_ms2, lat, lon, hdop)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.run_id, s.t_ms, s.speed_mps, s.accel_long_ms2, s.accel_vert_ms2, s.lat, s.lon, s.hdop],
        );
      }
    });
  }

  async listByRun(runId: string): Promise<Sample[]> {
    return this.db.query<Sample>(
      'SELECT run_id, t_ms, speed_mps, accel_long_ms2, accel_vert_ms2, lat, lon, hdop FROM samples WHERE run_id = ? ORDER BY t_ms',
      [runId],
    );
  }

  async deleteByRun(runId: string): Promise<void> {
    await this.db.execute('DELETE FROM samples WHERE run_id = ?', [runId]);
  }
}
