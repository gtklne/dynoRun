import type { Database } from '@/storage/database';
import type { Vehicle, Calibration, Run, Sample, DerivedCurve, RpmPoint, RunConditions } from '@/shared/types';
import { nowIso } from '@/shared/iso-time';
import { isNative } from './platform';

export const EXPORT_FORMAT_VERSION = 1;

export interface DatabaseDump {
  format_version: number;
  exported_at: string;
  vehicles: Vehicle[];
  calibrations: Calibration[];
  runs: Run[];
  samples: Sample[];
  derived_curves: DerivedCurve[];
}

interface RunRow extends Omit<Run, 'conditions'> { conditions: string }
interface CurveRow extends Omit<DerivedCurve, 'points'> { points: string }

export async function exportDatabase(db: Database): Promise<DatabaseDump> {
  const vehicles = await db.query<Vehicle>('SELECT * FROM vehicles ORDER BY created_at');
  const calibrations = await db.query<Calibration>('SELECT * FROM calibrations ORDER BY created_at');
  const runRows = await db.query<RunRow>('SELECT * FROM runs ORDER BY created_at');
  const runs: Run[] = runRows.map((r) => ({ ...r, conditions: JSON.parse(r.conditions) as RunConditions }));
  const samples = await db.query<Sample>(
    'SELECT run_id, t_ms, speed_mps, accel_long_ms2, accel_vert_ms2, lat, lon, hdop FROM samples ORDER BY run_id, t_ms',
  );
  const curveRows = await db.query<CurveRow>('SELECT * FROM derived_curves ORDER BY computed_at');
  const derived_curves: DerivedCurve[] = curveRows.map((c) => ({
    ...c,
    points: JSON.parse(c.points) as RpmPoint[],
  }));
  return {
    format_version: EXPORT_FORMAT_VERSION,
    exported_at: nowIso(),
    vehicles,
    calibrations,
    runs,
    samples,
    derived_curves,
  };
}

export async function downloadDump(dump: DatabaseDump): Promise<void> {
  const json = JSON.stringify(dump, null, 2);
  const filename = `dynorun-export-${dump.exported_at.replace(/[:.]/g, '-')}.json`;

  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: 'DynoRun export', url: written.uri });
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
