import type { Database } from '../database';
import type { DerivedCurve, RpmPoint } from '@/shared/types';

interface DerivedCurveRow extends Omit<DerivedCurve, 'points'> {
  points: string;
}

export class DerivedCurveRepository {
  constructor(private readonly db: Database) {}

  async upsert(curve: DerivedCurve): Promise<void> {
    await this.db.execute(
      `INSERT INTO derived_curves (run_id, rpm_min, rpm_max, points, pipeline_version, computed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         rpm_min = excluded.rpm_min,
         rpm_max = excluded.rpm_max,
         points = excluded.points,
         pipeline_version = excluded.pipeline_version,
         computed_at = excluded.computed_at`,
      [curve.run_id, curve.rpm_min, curve.rpm_max, JSON.stringify(curve.points), curve.pipeline_version, curve.computed_at],
    );
  }

  async getByRun(runId: string): Promise<DerivedCurve | null> {
    const rows = await this.db.query<DerivedCurveRow>(
      'SELECT * FROM derived_curves WHERE run_id = ?',
      [runId],
    );
    if (!rows[0]) return null;
    return { ...rows[0], points: JSON.parse(rows[0].points) as RpmPoint[] };
  }
}
