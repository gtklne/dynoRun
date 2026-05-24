import { useEffect, useState } from 'react';
import { useDatabase } from '@/storage/db-context';
import { exportDatabase, downloadDump } from '@/app/export';
import { ensureGeolocation, type GeolocationStatus } from '@/app/geolocation-permission';
import { WakeLock } from '@/app/wake-lock';

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
      downloadDump(dump);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section>
      <h1>Settings</h1>

      <h2>Permissions</h2>
      <ul>
        <li>Geolocation: {geoStatus ?? 'checking…'}</li>
        <li>Screen wake lock: {wakeSupported ? 'supported' : 'not supported on this device'}</li>
      </ul>

      <h2>Data</h2>
      <p>Download a JSON copy of all your vehicles, calibrations, runs, and curves. Useful as a backup until cloud sync ships.</p>
      <button onClick={onExport} disabled={exporting}>
        {exporting ? 'Exporting…' : 'Export data'}
      </button>
    </section>
  );
}
