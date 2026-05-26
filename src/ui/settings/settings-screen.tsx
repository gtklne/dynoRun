import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ensureGeolocation, type GeolocationStatus } from '@/app/geolocation-permission';
import { WakeLock } from '@/app/wake-lock';
import { useReplayState, setActiveReplay } from '@/sensors/replay-state';
import { describeRecording, type SensorRecording } from '@/sensors/recording';
import { useAuth } from '@/auth/auth-context';
import { useUnits } from '@/app/units-context';
import { SegmentedControl } from '@/ui/components/segmented-control';
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

function isValidRecording(value: unknown): value is SensorRecording {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    r.version === 1 &&
    (r.kind === 'run' || r.kind === 'calibration') &&
    typeof r.recorded_at === 'string' &&
    Array.isArray(r.gps_fixes) &&
    Array.isArray(r.motion_fixes)
  );
}

function readCountdownInitial(): boolean {
  try {
    return localStorage.getItem(COUNTDOWN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

function ToggleSwitch({ checked, onChange, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
        checked
          ? 'bg-amber-500 border-amber-400'
          : 'bg-zinc-700 border-zinc-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { unit, setUnit } = useUnits();
  const [geoStatus, setGeoStatus] = useState<GeolocationStatus | null>(null);
  const [wakeSupported, setWakeSupported] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [countdownEnabled, setCountdownEnabled] = useState<boolean>(readCountdownInitial);
  const [signingOut, setSigningOut] = useState(false);
  const { active: activeReplay } = useReplayState();

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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isValidRecording(parsed)) {
        throw new Error('Not a valid sensor recording (missing version/kind/fixes fields)');
      }
      setActiveReplay(parsed);
    } catch (err) {
      setUploadError(String(err));
    }
    e.target.value = '';
  }

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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>

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
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <p className="text-zinc-400 text-xs">
            Upload a recorded run or calibration to replay it through the app instead of using live GPS — useful for testing calibrations and runs without driving.
          </p>

          {activeReplay ? (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest">Replay active</p>
              </div>
              <p className="text-zinc-300 text-xs font-mono">{describeRecording(activeReplay)}</p>
              <button
                onClick={() => setActiveReplay(null)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2 rounded-lg transition-colors text-sm border border-zinc-700"
              >
                Disable replay
              </button>
            </div>
          ) : (
            <p className="text-zinc-500 text-xs italic">No recording loaded — calibrations and runs will use live sensors.</p>
          )}

          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-zinc-700 rounded-xl p-4 cursor-pointer hover:border-zinc-500 transition-colors">
            <svg className="text-zinc-500" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
            </svg>
            <span className="text-zinc-300 text-sm font-medium">
              {activeReplay ? 'Replace recording' : 'Upload recording'}
            </span>
            <input type="file" accept="application/json" onChange={onFile} className="sr-only" />
          </label>

          {uploadError && (
            <p className="text-red-400 text-xs">{uploadError}</p>
          )}

          <div className="pt-1 border-t border-zinc-800 -mx-4 px-4 mt-3">
            <Link
              to="/recordings"
              className="flex items-center justify-between py-2.5 text-zinc-300 hover:text-amber-400 text-sm font-medium transition-colors"
            >
              <span>Manage raw recordings</span>
              <span aria-hidden>→</span>
            </Link>
            <Link
              to="/replay"
              className="flex items-center justify-between py-2.5 text-zinc-300 hover:text-amber-400 text-sm font-medium transition-colors border-t border-zinc-800/60"
            >
              <span>Fixture replay (debug)</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
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
