import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordingRepository, toSensorRecording } from '@/api/repositories/recording-repository';
import { isSensorRecording } from '@/sensors/recording';
import type { RecordingSummary } from '@/api/repositories/types';
import {
  Advisory,
  MinimaTable,
  Na,
  NotesBox,
  PlateButton,
  TitleBlock,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number): string {
  const total_s = Math.round(ms / 1000);
  const m = Math.floor(total_s / 60);
  const s = total_s % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function ImportIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <polyline points="8 11 12 7 16 11" />
      <line x1="12" y1="7" x2="12" y2="17" />
      <path d="M4 17v3h16v-3" />
    </svg>
  );
}

export function RecordingsScreen() {
  const navigate = useNavigate();
  const [recordings, setRecordings] = useState<RecordingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await recordingRepository.list();
      setRecordings(rows);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function download(id: string) {
    setBusy(id);
    setError(null);
    try {
      const full = await recordingRepository.get(id);
      if (!full) throw new Error('Recording not found');
      const payload = toSensorRecording(full);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = payload.recorded_at.replace(/[:.]/g, '-');
      a.download = `dynorun-${payload.kind}-${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this recording? This cannot be undone.')) return;
    setBusy(id);
    setError(null);
    try {
      await recordingRepository.delete(id);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isSensorRecording(parsed)) {
        throw new Error('Not a valid sensor recording (missing version/kind/fixes fields)');
      }
      await recordingRepository.create({
        kind: parsed.kind,
        vehicle_id: parsed.meta.vehicle_id ?? null,
        calibration_id: parsed.meta.calibration_id ?? null,
        run_id: parsed.meta.run_id ?? null,
        gear_label: parsed.meta.gear_label ?? null,
        user_rpm: parsed.meta.user_rpm ?? null,
        label: parsed.meta.label ?? `Imported ${file.name}`,
        recorded_at: parsed.recorded_at,
        duration_ms: Math.round(parsed.duration_ms),
        data: { gps_fixes: parsed.gps_fixes, motion_fixes: parsed.motion_fixes },
      });
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const columns: MinimaColumn<RecordingSummary>[] = [
    {
      key: 'kind',
      head: 'Kind',
      cell: (r) => <span className="t-label">{r.kind}</span>,
    },
    {
      key: 'label',
      head: 'Label',
      cell: (r) => (
        <span className="block max-w-[22ch] truncate">{r.label ?? formatDate(r.recorded_at)}</span>
      ),
    },
    {
      key: 'gear',
      head: 'Gear',
      cell: (r) => (r.gear_label ? r.gear_label : <Na title="Not captured in a gear" />),
    },
    {
      key: 'rpm',
      head: 'RPM',
      numeric: true,
      cell: (r) => (r.user_rpm != null ? r.user_rpm.toFixed(0) : <Na title="No target RPM" />),
    },
    { key: 'recorded', head: 'Recorded', cell: (r) => formatDate(r.recorded_at) },
    { key: 'duration', head: 'Duration', numeric: true, cell: (r) => formatDuration(r.duration_ms) },
    { key: 'gps', head: 'GPS fixes', numeric: true, cell: (r) => r.gps_count },
    { key: 'motion', head: 'Motion fixes', numeric: true, cell: (r) => r.motion_count },
    {
      key: 'actions',
      head: 'Actions',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <PlateButton
            variant="procedure"
            onClick={() => navigate(`/replay/${r.id}`)}
            style={{ minHeight: 32, padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}
          >
            Replay
          </PlateButton>
          <PlateButton
            onClick={() => download(r.id)}
            disabled={busy === r.id}
            style={{ minHeight: 32, padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}
          >
            Download
          </PlateButton>
          <PlateButton
            onClick={() => remove(r.id)}
            disabled={busy === r.id}
            style={{ minHeight: 32, padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}
          >
            Delete
          </PlateButton>
        </span>
      ),
    },
  ];

  return (
    <div className="plate-stack">
      <TitleBlock
        title="Recordings"
        meta={[
          { label: 'Stored', value: recordings === null ? <Na /> : recordings.length },
          { label: 'Source', value: 'Every calibration and run' },
        ]}
      />

      {error && <Advisory>{error}</Advisory>}

      <Zone label="Import a recording" note="JSON exported from this app" flush>
        <label className="hatch flex cursor-pointer items-center justify-center gap-2.5 px-3 py-5 transition-colors hover:bg-[var(--color-plane-2)]">
          <ImportIcon />
          <span className="t-label" style={{ color: 'var(--color-ink)' }}>
            {uploading ? 'Uploading...' : 'Choose a recording JSON file'}
          </span>
          <input
            type="file"
            accept="application/json"
            onChange={onUpload}
            disabled={uploading}
            className="sr-only"
          />
        </label>
      </Zone>

      <Zone label="Stored recordings" flush>
        {recordings === null ? (
          <p className="t-annotation px-3 py-6 text-center">Loading...</p>
        ) : (
          <MinimaTable
            columns={columns}
            rows={recordings}
            rowKey={(r) => r.id}
            empty="No recordings yet. Calibrations and runs are captured automatically."
          />
        )}
      </Zone>

      <NotesBox>
        A recording is the raw sensor log, every GPS and motion fix exactly as the device reported
        it. Replaying one drives the whole app from that log, so an analysis change can be checked
        against a real ride without driving again. Deleting a recording does not delete the run it
        came from.
      </NotesBox>
    </div>
  );
}
