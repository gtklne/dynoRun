import { useEffect, useState } from 'react';
import { useDatabase } from '@/storage/db-context';
import { exportDatabase, downloadDump } from '@/app/export';
import { ensureGeolocation, type GeolocationStatus } from '@/app/geolocation-permission';
import { WakeLock } from '@/app/wake-lock';

const statusColor: Record<string, string> = {
  granted: 'text-emerald-400',
  prompt: 'text-amber-400',
  denied: 'text-red-400',
};

export function SettingsScreen() {
  const db = useDatabase();
  const [geoStatus, setGeoStatus] = useState<GeolocationStatus | null>(null);
  const [wakeSupported, setWakeSupported] = useState<boolean>(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      setGeoStatus(await ensureGeolocation());
      setWakeSupported(new WakeLock().supported);
    })();
  }, []);

  async function onExport() {
    setExporting(true);
    try {
      const dump = await exportDatabase(db);
      await downloadDump(dump);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>

      {/* Permissions */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Permissions</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
            <div>
              <p className="text-zinc-200 text-sm font-medium">Location</p>
              <p className="text-zinc-500 text-xs mt-0.5">Required for GPS speed measurements</p>
            </div>
            <span className={`text-xs font-semibold capitalize ${statusColor[geoStatus ?? ''] ?? 'text-zinc-400'}`}>
              {geoStatus ?? 'Checking…'}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-zinc-200 text-sm font-medium">Screen wake lock</p>
              <p className="text-zinc-500 text-xs mt-0.5">Prevents screen from sleeping during a run</p>
            </div>
            <span className={`text-xs font-semibold ${wakeSupported ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {wakeSupported ? 'Supported' : 'Not available'}
            </span>
          </div>
        </div>
      </div>

      {/* Data */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Data</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-zinc-400 text-sm">
            Download a JSON backup of all vehicles, calibrations, runs, and power curves.
          </p>
          <button
            onClick={onExport}
            disabled={exporting}
            className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-100 font-medium py-3 rounded-xl transition-colors border border-zinc-700 text-sm"
          >
            {exporting ? 'Exporting…' : 'Export data'}
          </button>
        </div>
      </div>

      {/* About */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">About</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800">
            <span className="text-zinc-400 text-sm">Version</span>
            <span className="text-zinc-300 text-sm font-medium">0.1.0</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-zinc-400 text-sm">Physics model</span>
            <span className="text-zinc-300 text-sm font-medium">F = ma (comparative)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
