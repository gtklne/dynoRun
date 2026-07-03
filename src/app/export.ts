import type { Vehicle, Calibration, Run, Sample, DerivedCurve } from '@/shared/types';
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

export function createDatabaseDump(
  vehicles: Vehicle[],
  calibrations: Calibration[],
  runs: Run[],
  samples: Sample[],
  derived_curves: DerivedCurve[],
): DatabaseDump {
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
  const filename = `dynorun-export-${dump.exported_at.replace(/[:.]/g, '-')}.json`;
  await downloadJsonFile(filename, JSON.stringify(dump, null, 2));
}

export async function downloadJsonFile(filename: string, json: string): Promise<void> {
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
