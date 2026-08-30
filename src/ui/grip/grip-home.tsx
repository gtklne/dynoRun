import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { packGripData } from '@/analysis/grip/storage';
import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import { invalidateGripSession } from './grip-session-cache';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import type { GripSessionSummary } from '@/api/repositories/types';
import type { Vehicle } from '@/shared/types';
import { formatDurationMs, formatRelativeTime } from '@/shared/format-time';
import {
  Advisory,
  MinimaTable,
  Na,
  Plate,
  PlateButton,
  PlateLink,
  NotesBox,
  TitleBlock,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';
import { formatLapTime } from './format-lap';

function ImportIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden="true">
      <path d="M5 3.5h9l5 5V20.5H5z" />
      <path d="M14 3.5v5h5" />
      <line x1="12" y1="11" x2="12" y2="17.5" />
      <polyline points="9 14.5 12 17.5 15 14.5" />
    </svg>
  );
}

export function GripHome() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GripSessionSummary[] | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await gripSessionRepository.list());
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    vehicleRepository.list().then(setVehicles).catch(() => {});
  }, []);

  const vehicleName = useMemo(() => new Map(vehicles.map((v) => [v.id, v.name])), [vehicles]);

  async function importFile(file: File) {
    setError(null);
    setImporting(true);
    try {
      const parsed = parseRaceboxCsv(await file.text());
      const created = await gripSessionRepository.create({ data: packGripData(parsed) });
      navigate(`/grip/sessions/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    setBusy(id);
    setError(null);
    try {
      await gripSessionRepository.delete(id);
      // otherwise the analyzer and compare keep serving the cached copy of a
      // session the server no longer has
      invalidateGripSession(id);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const columns: MinimaColumn<GripSessionSummary>[] = [
    {
      key: 'name',
      head: 'Session',
      cell: (s) => (
        <span className="block max-w-[16rem] truncate">{s.label ?? s.track ?? 'Untitled session'}</span>
      ),
    },
    {
      key: 'where',
      head: 'Track and date',
      cell: (s) => {
        const parts = [s.label ? s.track : null, s.config, s.session_date].filter(Boolean);
        return parts.length ? <span className="t-annotation">{parts.join(' · ')}</span> : <Na />;
      },
    },
    {
      key: 'vehicle',
      head: 'Vehicle',
      cell: (s) =>
        s.vehicle_id && vehicleName.get(s.vehicle_id) ? (
          vehicleName.get(s.vehicle_id)
        ) : (
          <Na title="No vehicle linked to this session" />
        ),
    },
    { key: 'laps', head: 'Laps', numeric: true, cell: (s) => s.lap_count },
    {
      key: 'best',
      head: 'Best lap',
      numeric: true,
      cell: (s) => (s.best_lap_s != null ? formatLapTime(s.best_lap_s) : <Na title="No timed lap" />),
    },
    {
      key: 'dur',
      head: 'Duration',
      numeric: true,
      cell: (s) => formatDurationMs(s.duration_s * 1000),
    },
    {
      key: 'added',
      head: 'Imported',
      numeric: true,
      cell: (s) => <span className="t-annotation">{formatRelativeTime(s.created_at)}</span>,
    },
    {
      key: 'act',
      head: '',
      cell: (s) => (
        <span className="flex justify-end">
          <PlateButton
            // the row itself opens the session, so this must not bubble into it
            onClick={(e) => { e.stopPropagation(); void remove(s.id); }}
            disabled={busy === s.id}
            style={{ minHeight: 32, padding: '0.25rem 0.625rem', fontSize: '0.6875rem' }}
          >
            Delete
          </PlateButton>
        </span>
      ),
    },
  ];

  return (
    <Plate className="plate-issue">
      <TitleBlock
        ident="Grip Utilization"
        title="Track session library"
        actions={
          sessions && sessions.length > 0 ? (
            <PlateLink to="/grip/compare" variant="solid">
              Compare laps
            </PlateLink>
          ) : undefined
        }
        meta={[
          { label: 'Source', value: 'RaceBox CSV, 25 Hz' },
          { label: 'Sessions', value: sessions ? sessions.length : <Na /> },
          {
            label: 'Derives',
            value: 'Traction envelope, corners, load transfer',
          },
          { label: 'Scores', value: 'g demand × 100, absolute' },
        ]}
      />

      {error && <Advisory>{error}</Advisory>}

      <Zone
        label="Import"
        note="Parsed in your browser, then saved to your account"
        framed={false}
      >
        <label
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) void importFile(f);
          }}
          className={`box-frame flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-8 text-center ${dragging ? 'hatch' : ''}`}
          style={dragging ? { borderColor: 'var(--color-procedure)' } : undefined}
        >
          <ImportIcon />
          <span className="t-label" style={{ color: 'var(--color-ink)' }}>
            {importing ? 'Analyzing session' : 'Drop a RaceBox session CSV, or tap to choose'}
          </span>
          <span className="t-annotation" style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
            A 30 minute session is a few megabytes. Nothing leaves the browser until it parses.
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={importing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
            className="sr-only"
          />
        </label>
      </Zone>

      <Zone label="Saved sessions" note={sessions ? `${sessions.length} stored` : undefined}>
        {sessions === null ? (
          <p className="t-annotation px-3 py-6 text-center">Loading…</p>
        ) : (
          <MinimaTable
            columns={columns}
            rows={sessions}
            rowKey={(s) => s.id}
            onSelect={(s) => navigate(`/grip/sessions/${s.id}`)}
            empty="No sessions yet. Export a session from the RaceBox app as CSV and drop it above to see where you have grip to spare."
            caption="Select a row to open the analyzer."
          />
        )}
      </Zone>

      <NotesBox>
        Every headline figure in Grip is an absolute score, g demand × 100, so 100 is roughly 1 g. Nothing here is
        a percentage of your own best, because a percentage guarantees readings over 100% and hides a slow day.
        Lateral g is derived from lean angle and longitudinal g from GPS speed corrected for a fixed generic drag
        model, so both reflect your logger, your tyres and your inputs, not a calibrated rig.
      </NotesBox>
    </Plate>
  );
}
