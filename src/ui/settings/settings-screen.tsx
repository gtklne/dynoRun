import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ensureGeolocation, type GeolocationStatus } from '@/app/geolocation-permission';
import { WakeLock } from '@/app/wake-lock';
import { downloadJsonFile } from '@/app/export';
import { getAccountExport } from '@/api/repositories/account-repository';
import { useAuth } from '@/auth/auth-context';
import { useUnits } from '@/app/units-context';
import { ToggleSwitch } from '@/ui/components/toggle-switch';
import { useToast } from '@/ui/components/toast';
import { Advisory, Na, Plate, PlateSegmented, RevisionBar, TitleBlock, Zone } from '@/ui/plate';
import { DeleteAccountModal } from './delete-account-modal';
import {
  readPlatePreference,
  storePlatePreference,
  type PlatePreference,
} from './plate-preference';
import type { PowerUnit } from '@/shared/format-power';

const COUNTDOWN_STORAGE_KEY = 'dynorun:countdown';

const POWER_UNIT_OPTIONS: { value: PowerUnit; label: string }[] = [
  { value: 'kW', label: 'kW' },
  { value: 'hp', label: 'hp' },
  { value: 'PS', label: 'PS' },
];

const PLATE_OPTIONS: { value: PlatePreference; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
  { value: 'system', label: 'System' },
];

function readCountdownInitial(): boolean {
  try {
    return localStorage.getItem(COUNTDOWN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function ForwardIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
      className="shrink-0"
    >
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </svg>
  );
}

/**
 * One ruled line of the sheet: what the setting is on the left, the reading or
 * the control on the right. Rows are separated by a hairline, never boxed
 * individually, so a zone reads as one table rather than a stack of cards.
 */
function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rule-t flex items-center justify-between gap-4 px-3 py-3 [&:not(:first-child)]:border-t">
      <div className="min-w-0">
        <p className="t-data text-sm">{label}</p>
        {note && <p className="t-annotation mt-1">{note}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/** A navigation line. Same rhythm as a Row, but the whole line is the target. */
function NavRow({ to, label, note }: { to: string; label: string; note?: string }) {
  return (
    <Link
      to={to}
      className="rule-t flex items-center justify-between gap-4 px-3 py-3 no-underline transition-colors hover:bg-[var(--color-plane-2)] [&:not(:first-child)]:border-t"
      style={{ color: 'var(--color-ink)' }}
    >
      <span className="min-w-0">
        <span className="t-data block text-sm">{label}</span>
        {note && <span className="t-annotation mt-1 block">{note}</span>}
      </span>
      <ForwardIcon />
    </Link>
  );
}

/** A permission reading. Granted is a gain, anything else is an advisory. */
function StatusReading({ value, good }: { value: string | null; good: boolean }) {
  if (value === null) return <span className="t-annotation">Checking</span>;
  return (
    <span
      className="t-label"
      style={{ color: good ? 'var(--color-go)' : 'var(--color-caution)' }}
    >
      {value}
    </span>
  );
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { unit, setUnit } = useUnits();
  const toast = useToast();
  const [geoStatus, setGeoStatus] = useState<GeolocationStatus | null>(null);
  const [wakeSupported, setWakeSupported] = useState<boolean>(false);
  const [countdownEnabled, setCountdownEnabled] = useState<boolean>(readCountdownInitial);
  const [plate, setPlate] = useState<PlatePreference>(readPlatePreference);
  const [signingOut, setSigningOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

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

  function handlePlateChange(next: PlatePreference) {
    setPlate(next);
    storePlatePreference(next);
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

  async function handleExport() {
    setExporting(true);
    try {
      const data = await getAccountExport();
      await downloadJsonFile(
        `dynorun-account-export-${data.exported_at.replace(/[:.]/g, '-')}.json`,
        JSON.stringify(data, null, 2),
      );
      toast.show('Export downloaded', { variant: 'success' });
    } catch {
      toast.show('Export failed', { variant: 'error' });
    } finally {
      setExporting(false);
    }
  }

  async function handleAccountDeleted() {
    setDeleteModalOpen(false);
    await signOut();
    navigate('/login');
  }

  return (
    <Plate className="plate-issue">
      <TitleBlock
        ident="wasgoht"
        title="Settings"
        meta={[
          { label: 'Signed in as', value: user?.email ?? <Na /> },
          { label: 'Role', value: isAdmin ? 'Admin' : 'User' },
          { label: 'Version', value: '0.1.0' },
          { label: 'Physics model', value: 'F = ma (comparative)' },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-x-8 lg:gap-y-10">
        <Zone label="Account" note="This device">
          <Row label="Signed in as" note="Every run and session is filed under this account">
            <span className="t-data text-sm">{user?.email ?? <Na />}</span>
          </Row>
          {isAdmin && <NavRow to="/admin" label="Admin panel" note="User and content KPIs" />}
          <div className="rule-t p-3">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="ctl w-full"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </Zone>

        <Zone label="Display" note="How readings are set on every sheet">
          <Row label="Power units" note="Used everywhere power is shown">
            <PlateSegmented<PowerUnit>
              label="Power units"
              value={unit}
              options={POWER_UNIT_OPTIONS}
              onChange={setUnit}
            />
          </Row>
          <Row label="Plate" note="Night inverts the sheet. System follows your device">
            <PlateSegmented<PlatePreference>
              label="Plate"
              value={plate}
              options={PLATE_OPTIONS}
              onChange={handlePlateChange}
            />
          </Row>
        </Zone>

        <Zone label="Driving" note="Capture behaviour">
          <Row label="Countdown before run" note="3-2-1 before recording starts">
            <ToggleSwitch
              checked={countdownEnabled}
              onChange={setCountdownEnabled}
              ariaLabel="Countdown before run"
            />
          </Row>
        </Zone>

        <Zone label="Permissions" note="What this browser will allow">
          <Row label="Location" note="Required for GPS speed measurements">
            <StatusReading value={geoStatus} good={geoStatus === 'granted'} />
          </Row>
          <Row label="Screen wake lock" note="Prevents the screen sleeping during a run">
            <StatusReading
              value={wakeSupported ? 'Supported' : 'Not available'}
              good={wakeSupported}
            />
          </Row>
        </Zone>

        <Zone label="Privacy" note="Your data, on request">
          <Row label="Download my data" note="Everything tied to your account, as JSON">
            <button type="button" onClick={handleExport} disabled={exporting} className="ctl">
              {exporting ? 'Exporting…' : 'Download'}
            </button>
          </Row>
        </Zone>

        <Zone label="Legal">
          <NavRow to="/privacy" label="Privacy Policy" note="What is collected, and why" />
          <NavRow to="/imprint" label="Imprint" note="Who operates this site" />
        </Zone>

        <Zone label="Developer" note="Test the app without driving">
          <NavRow
            to="/replay"
            label="Replay Lab"
            note="Re-run a recorded run or calibration in real time"
          />
          <NavRow to="/recordings" label="Manage raw recordings" note="Stored sensor envelopes" />
        </Zone>

        <Zone label="Danger zone" note="Not reversible" className="lg:col-span-2">
          <div className="p-3">
            <Advisory>
              Deleting your account permanently removes every vehicle, calibration, run,
              recording and GPS sample filed under it. There is no undo and no backup copy
              you can ask for.
            </Advisory>
          </div>
          <Row label="Delete my account" note="Requires typing your email address to confirm">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="ctl"
              style={{ borderColor: 'var(--color-caution)', color: 'var(--color-caution)' }}
            >
              Delete account
            </button>
          </Row>
        </Zone>
      </div>

      <RevisionBar
        entries={[
          { label: 'App version', value: '0.1.0' },
          { label: 'Physics model', value: 'F = ma, wheel power, no driveline correction' },
          { label: 'Stored locally', value: 'Units, countdown, plate' },
        ]}
      />

      {user && (
        <DeleteAccountModal
          open={deleteModalOpen}
          userEmail={user.email}
          onClose={() => setDeleteModalOpen(false)}
          onDeleted={handleAccountDeleted}
        />
      )}
    </Plate>
  );
}
