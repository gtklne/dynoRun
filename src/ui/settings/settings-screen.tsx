import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ensureGeolocation, type GeolocationStatus } from '@/app/geolocation-permission';
import { WakeLock } from '@/app/wake-lock';
import { useAuth } from '@/auth/auth-context';
import { useUnits } from '@/app/units-context';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { ToggleSwitch } from '@/ui/components/toggle-switch';
import type { PowerUnit } from '@/shared/format-power';

const COUNTDOWN_STORAGE_KEY = 'dynorun:countdown';

const statusColor: Record<string, string> = {
  granted: 'text-emerald-400',
  prompt: 'text-amber-400',
  denied: 'text-red-400',
};

const POWER_UNIT_OPTIONS: ReadonlyArray<{ value: PowerUnit; label: string }> = [
  { value: 'kW', label: 'kW' },
  { value: 'hp', label: 'hp' },
  { value: 'PS', label: 'PS' },
];

function readCountdownInitial(): boolean {
  try {
    return localStorage.getItem(COUNTDOWN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { unit, setUnit } = useUnits();
  const [geoStatus, setGeoStatus] = useState<GeolocationStatus | null>(null);
  const [wakeSupported, setWakeSupported] = useState<boolean>(false);
  const [countdownEnabled, setCountdownEnabled] = useState<boolean>(readCountdownInitial);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    (async () => {
      setGeoStatus(await ensureGeolocation());
      setWakeSupported(new WakeLock().supported);
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COUNTDOWN_STORAGE_KEY, String(countdownEnabled));
    } catch { /* noop */ }
  }, [countdownEnabled]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <h1 className="text-2xl font-bold text-zinc-100 lg:col-span-2">Settings</h1>

      {/* Account */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Account</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 gap-3">
            <span className="text-zinc-200 text-sm">Signed in as</span>
            <span className="text-zinc-400 text-sm truncate">{user?.email ?? '—'}</span>
          </div>
          <div className="p-3">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full bg-zinc-800 hover:bg-red-900/60 text-zinc-300 hover:text-red-300 border border-zinc-700 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>

      {/* Display */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Display</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-zinc-200 text-sm font-medium">Power units</p>
            <p className="text-zinc-500 text-xs mt-0.5">Used everywhere power is shown.</p>
          </div>
          <SegmentedControl<PowerUnit>
            options={POWER_UNIT_OPTIONS}
            value={unit}
            onChange={setUnit}
            ariaLabel="Power units"
          />
        </div>
      </div>

      {/* Driving */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Driving</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-zinc-200 text-sm font-medium">Countdown before run</p>
            <p className="text-zinc-500 text-xs mt-0.5">3-2-1 before recording starts.</p>
          </div>
          <ToggleSwitch
            checked={countdownEnabled}
            onChange={setCountdownEnabled}
            ariaLabel="Countdown before run"
          />
        </div>
      </div>

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

      {/* Developer */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Developer</p>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-400 text-xs mb-2">
            Re-run a recorded run or calibration in real time to test the app without driving.
          </p>
          <Link
            to="/replay"
            className="flex items-center justify-between py-2.5 text-zinc-300 hover:text-amber-400 text-sm font-medium transition-colors"
          >
            <span>Replay Lab</span>
            <span aria-hidden>→</span>
          </Link>
          <Link
            to="/recordings"
            className="flex items-center justify-between py-2.5 text-zinc-300 hover:text-amber-400 text-sm font-medium transition-colors border-t border-zinc-800/60"
          >
            <span>Manage raw recordings</span>
            <span aria-hidden>→</span>
          </Link>
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
