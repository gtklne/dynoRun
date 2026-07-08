import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { cornerStats } from '@/analysis/grip/corners';
import { bestLap } from '@/analysis/grip/laps';
import { computeCombined } from '@/analysis/grip/load';
import {
  DEFAULT_GRIP_SETTINGS,
  RECOMPUTE_KEYS,
  sanitizeGripSettings,
  type GripSettingKey,
  type GripSettings,
} from '@/analysis/grip/settings';
import { unpackGripData } from '@/analysis/grip/storage';
import type { GripCorner, ParsedGripSession } from '@/analysis/grip/types';
import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import type { GripSessionFull } from '@/api/repositories/types';
import type { Vehicle } from '@/shared/types';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { CornerCards } from './corner-cards';
import { formatLapTime } from './format-lap';
import { GripSettingsDrawer } from './grip-settings-drawer';
import { LapTabs } from './lap-tabs';
import { LoadTimeline } from './load-timeline';
import { metricModeName, type GripMetricMode } from './metric-mode';
import { TelemetryReadout } from './telemetry-readout';
import { TrackMap } from './track-map';
import { TractionCircle } from './traction-circle';
import { TransportBar } from './transport-bar';
import { useGripPlayback } from './use-grip-playback';

function Panel({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-2.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <span>{title}</span>
        {hint && <span className="font-normal normal-case tracking-normal">{hint}</span>}
      </h3>
      {children}
    </div>
  );
}

export function GripSessionScreen() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<GripSessionFull | null>(null);
  const [parsed, setParsed] = useState<ParsedGripSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [settings, setSettings] = useState<GripSettings>(DEFAULT_GRIP_SETTINGS);
  const [mode, setMode] = useState<GripMetricMode>('load');
  const [drawer, setDrawer] = useState<'settings' | 'help' | null>(null);
  const [lapNum, setLapNum] = useState<number | null>(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const full = await gripSessionRepository.get(sessionId);
      if (cancelled) return;
      if (!full) {
        setLoadError('Session not found.');
        return;
      }
      try {
        setParsed(unpackGripData(full.data));
      } catch {
        setLoadError('This session’s stored data is unreadable.');
        return;
      }
      setSession(full);
      setSettings(sanitizeGripSettings(full.settings));
      setLabel(full.label ?? '');
    })().catch(() => setLoadError('Could not load the session.'));
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    vehicleRepository.list().then(setVehicles).catch(() => {});
  }, []);

  // Heavy derivation only when a 'recompute'-class setting changes; τ re-mixes
  // cheaply below and 'render'-class settings just flow into props.
  const recomputeSig = RECOMPUTE_KEYS.map((k) => settings[k]).join(',');
  const analysis = useMemo(
    () => (parsed ? analyzeGripSession(parsed, settings) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, recomputeSig],
  );
  const dynC = useMemo(
    () => (analysis ? computeCombined(analysis.comb, analysis.loadRate, settings.tau) : null),
    [analysis, settings.tau],
  );

  const laps = analysis?.laps ?? [];
  const lap = laps.find((l) => l.num === lapNum) ?? (laps.length ? bestLap(laps) : null);
  const lapLength = lap ? lap.end - lap.start + 1 : 1;
  const playback = useGripPlayback(lapLength, `${sessionId}:${lap?.num}`);

  const metric: ArrayLike<number> | null = mode === 'load' ? dynC : analysis?.comb ?? null;

  const cornerLive = useMemo(() => {
    if (!lap || !metric) return new Map<number, { apexG: number; peakG: number }>();
    return new Map(lap.corners.map((c) => {
      const { apex, peak } = cornerStats(c, metric);
      return [c.n, { apexG: apex, peakG: peak }] as const;
    }));
  }, [lap, metric]);
  const cornerApexG = useMemo(
    () => new Map(Array.from(cornerLive, ([n, s]) => [n, s.apexG])),
    [cornerLive],
  );
  // best apex demand per corner number across ALL laps — the "you have proven
  // you can" reference the spare flag compares against
  const bestApexG = useMemo(() => {
    const best = new Map<number, number>();
    if (!metric) return best;
    for (const l of laps) {
      for (const c of l.corners) {
        const apex = cornerStats(c, metric).apex;
        if (apex > (best.get(c.n) ?? 0)) best.set(c.n, apex);
      }
    }
    return best;
  }, [laps, metric]);

  // Persist tuned settings, debounced; skip the initial load's setSettings.
  const persistArmed = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (!persistArmed.current) {
      persistArmed.current = true;
      return;
    }
    const timer = setTimeout(() => {
      gripSessionRepository.update(session.id, { settings }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [settings, session]);

  const changeSetting = useCallback((key: GripSettingKey, value: number) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  function saveLabel() {
    if (!session) return;
    const next = label.trim() || null;
    if (next === session.label) return;
    setSession({ ...session, label: next });
    gripSessionRepository.update(session.id, { label: next }).catch(() => {});
  }

  function setVehicle(vehicleId: string) {
    if (!session) return;
    const next = vehicleId || null;
    setSession({ ...session, vehicle_id: next });
    gripSessionRepository.update(session.id, { vehicle_id: next }).catch(() => {});
  }

  // Space = play/pause, ←/→ = scrub (±1 s with shift), Esc = close drawer —
  // but never while typing in an input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setDrawer(null); return; }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (!analysis) return;
      if (e.key === ' ') { e.preventDefault(); playback.toggle(); }
      else if (e.key === 'ArrowRight') playback.scrub(playback.cursor + (e.shiftKey ? 25 : 1));
      else if (e.key === 'ArrowLeft') playback.scrub(playback.cursor - (e.shiftKey ? 25 : 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analysis, playback]);

  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-zinc-400">{loadError}</p>
        <Link to="/grip" className="mt-3 inline-block text-sm font-semibold text-sky-400 hover:text-sky-300">
          ← Back to Grip sessions
        </Link>
      </div>
    );
  }
  if (!session || !analysis || !lap || !metric || !dynC) {
    return <div className="py-16 text-center text-sm text-zinc-500">Loading session…</div>;
  }

  const globalCursor = lap.start + playback.cursor;
  const activeCorner = lap.corners.find((c) => globalCursor >= c.l && globalCursor <= c.r) ?? null;
  const tCur = analysis.ch.t[globalCursor] - analysis.ch.t[lap.start];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/grip" className="text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-300">
            ← Grip sessions
          </Link>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder={session.track || 'Untitled session'}
            aria-label="Session label"
            className="mt-0.5 block w-full max-w-md truncate rounded-md border border-transparent bg-transparent text-2xl font-bold text-zinc-100 outline-none transition-colors placeholder:text-zinc-100 hover:border-zinc-700 focus:border-sky-600 focus:placeholder:text-zinc-600"
          />
          <p className="mt-1 text-xs text-zinc-500">
            {[session.track, session.config, session.session_date].filter(Boolean).join(' · ')}
            {session.best_lap_s != null && <> · best <span className="font-mono text-zinc-400">{formatLapTime(session.best_lap_s)}</span></>}
            {' · '}{laps.length} timed laps
            {' · '}session score <span className="font-mono text-zinc-300">{Math.round(analysis.sessionScore)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={session.vehicle_id ?? ''}
            onChange={(e) => setVehicle(e.target.value)}
            aria-label="Linked vehicle"
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-xs font-medium text-zinc-300 outline-none focus:border-sky-600"
          >
            <option value="">No vehicle</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDrawer('help')}
            title="Help & how it works"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-400 transition-colors hover:border-sky-600 hover:text-zinc-100"
          >
            ?
          </button>
          <button
            type="button"
            onClick={() => setDrawer('settings')}
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-sm text-zinc-400 transition-colors hover:border-sky-600 hover:text-zinc-100"
          >
            ⚙
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <LapTabs laps={laps} bestNum={bestLap(laps).num} activeNum={lap.num} onSelect={(l) => setLapNum(l.num)} />
        <SegmentedControl
          ariaLabel="Colour metric"
          compact
          options={[
            { value: 'grip', label: 'Grip' },
            { value: 'load', label: 'Dynamic load' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title={<>Track map — {metricModeName(mode).toLowerCase()}</>}
          hint={
            <span className="flex items-center gap-2 text-[11px] text-zinc-500">
              0
              <span className="h-2 w-24 rounded" style={{ background: 'linear-gradient(90deg,#0ca30c,#fab219,#d03b3b)' }} />
              tyre {settings.anchorG.toFixed(2)}g
            </span>
          }
        >
          <TrackMap
            analysis={analysis}
            lap={lap}
            cursor={playback.cursor}
            metric={metric}
            cornerApexG={cornerApexG}
            anchorG={settings.anchorG}
            onSeek={playback.scrub}
          />
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Traction circle">
            <TractionCircle analysis={analysis} lap={lap} cursor={playback.cursor} metric={metric} rateFS={settings.rateFS} anchorG={settings.anchorG} />
          </Panel>
          <Panel
            title="Live telemetry"
            hint={activeCorner ? `In corner ${activeCorner.n} (${activeCorner.dir})` : 'Straight / transition'}
          >
            <TelemetryReadout
              analysis={analysis}
              lap={lap}
              cursor={playback.cursor}
              metric={metric}
              mode={mode}
              settings={settings}
            />
          </Panel>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <TransportBar playback={playback} lapLength={lapLength} tCur={tCur} tTot={lap.time} />
      </div>

      <Panel title="Load & transient timeline" hint="accel / brake · transfer rate">
        <LoadTimeline analysis={analysis} lap={lap} cursor={playback.cursor} rateFS={settings.rateFS} onSeek={playback.scrub} />
      </Panel>

      <CornerCards
        lap={lap}
        liveStats={cornerLive}
        bestApexG={bestApexG}
        mode={mode}
        settings={settings}
        activeCorner={activeCorner?.n ?? null}
        onSelect={(c: GripCorner) => playback.seek(c.ap - lap.start)}
      />

      <p className="pt-2 text-xs text-zinc-600">
        Physics assumptions and how to read each panel are in{' '}
        <button type="button" onClick={() => setDrawer('help')} className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
          Help &amp; how it works →
        </button>{' '}
        · tune every estimate in{' '}
        <button type="button" onClick={() => setDrawer('settings')} className="text-sky-400 underline underline-offset-2 hover:text-sky-300">
          Settings ⚙
        </button>
      </p>

      <GripSettingsDrawer
        open={drawer !== null}
        initialTab={drawer ?? 'settings'}
        settings={settings}
        onChange={changeSetting}
        onReset={() => setSettings(DEFAULT_GRIP_SETTINGS)}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
