import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordingRepository } from '@/api/repositories/recording-repository';
import { isSensorRecording } from '@/sensors/recording';
import { setPendingReplay, useReplayState } from '@/sensors/replay-state';
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

export function ReplayLabIndex() {
  const navigate = useNavigate();
  const { last } = useReplayState();
  const [recordings, setRecordings] = useState<RecordingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecordings(await recordingRepository.list());
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text());
        if (!isSensorRecording(parsed)) {
          throw new Error('Not a valid sensor recording (missing version/kind/fixes fields)');
        }
        // Ephemeral: hand off in memory, never persist.
        setPendingReplay(parsed);
        navigate('/replay/local');
      } catch (err) {
        setError(String(err));
      } finally {
        e.target.value = '';
      }
    })();
  }

  function replayLast() {
    if (!last) return;
    setPendingReplay(last);
    navigate('/replay/local');
  }

  const columns: MinimaColumn<RecordingSummary>[] = [
    { key: 'kind', head: 'Kind', cell: (r) => <span className="t-label">{r.kind}</span> },
    {
      key: 'label',
      head: 'Label',
      cell: (r) => (
        <span className="block max-w-[24ch] truncate">{r.label ?? formatDate(r.recorded_at)}</span>
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
  ];

  return (
    <div className="plate-stack">
      <TitleBlock
        title="Replay Lab"
        meta={[
          { label: 'Stored', value: recordings === null ? <Na /> : recordings.length },
          { label: 'In memory', value: last ? `${last.kind} recording` : <Na title="Nothing recorded this session" /> },
          { label: 'Persistence', value: 'Replays are never saved' },
        ]}
      />

      {error && <Advisory>{error}</Advisory>}

      <Zone label="Start a replay" note="Re-run a recording in real time, without driving">
        {last && (
          <div className="rule-b flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <div className="min-w-0">
              <p className="t-data text-sm">Last recording, still in memory</p>
              <p className="t-annotation mt-1">
                {last.kind} / {last.gps_fixes.length} GPS fixes / {(last.duration_ms / 1000).toFixed(1)} s
              </p>
            </div>
            <PlateButton variant="procedure" onClick={replayLast}>
              Replay it
            </PlateButton>
          </div>
        )}

        <label className="hatch flex cursor-pointer items-center justify-center gap-2.5 px-3 py-6 transition-colors hover:bg-[var(--color-sunk)]">
          <ImportIcon />
          <span className="t-label" style={{ color: 'var(--color-ink)' }}>
            Upload a recording JSON file
          </span>
          <input type="file" accept="application/json" onChange={onUpload} className="sr-only" />
        </label>
      </Zone>

      <Zone label="Stored recordings">
        {recordings === null ? (
          <p className="t-annotation px-3 py-8 text-center">Loading...</p>
        ) : (
          <MinimaTable
            columns={columns}
            rows={recordings}
            rowKey={(r) => r.id}
            onSelect={(r) => navigate(`/replay/${r.id}`)}
            empty="No recordings yet. Calibrations and runs are captured automatically."
          />
        )}
      </Zone>

      <NotesBox>
        A replay drives the app from a recorded sensor log at whatever rate you choose, so the same
        ride can be re-analysed after a change to the maths. Nothing a replay produces is written
        back: the curve it derives exists only for as long as the page is open.
      </NotesBox>
    </div>
  );
}
