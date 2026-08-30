import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { cornerStats } from '@/analysis/grip/corners';
import { bestLap } from '@/analysis/grip/laps';
import { computeCombined } from '@/analysis/grip/load';
import { bestApexPerTurn } from '@/analysis/grip/turns';
import {
  DEFAULT_GRIP_SETTINGS,
  RECOMPUTE_KEYS,
  sanitizeGripSettings,
  type GripSettingKey,
  type GripSettings,
} from '@/analysis/grip/settings';
import { isStoredGripData, unpackGripData } from '@/analysis/grip/storage';
import { GRIP_DATA_VERSION, type GripCorner, type ParsedGripSession } from '@/analysis/grip/types';
import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import type { GripSessionFull } from '@/api/repositories/types';
import type { Vehicle } from '@/shared/types';
import { formatRelativeTime } from '@/shared/format-time';
import {
  Advisory,
  CrossRefProvider,
  NotesBox,
  Na,
  NoReading,
  Plate,
  PlanView,
  PlateButton,
  PlateField,
  PlateLink,
  PlateSegmented,
  ProfileView,
  Readout,
  RevisionBar,
  TitleBlock,
  Zone,
  useCrossRef,
  usePlateInk,
} from '@/ui/plate';
import { demandSwatches } from './colors';
import { CornerMinima } from './corner-cards';
import { formatLapTime } from './format-lap';
import { invalidateGripSession, loadGripSession } from './grip-session-cache';
import { GripSettingsDrawer } from './grip-settings-drawer';
import { LapTabs } from './lap-tabs';
import { LoadTimeline } from './load-timeline';
import { metricModeName, type GripMetricMode } from './metric-mode';
import { TelemetryReadout } from './telemetry-readout';
import { TrackMap } from './track-map';
import { TractionCircle } from './traction-circle';
import { TransportBar } from './transport-bar';
import { useGripPlayback } from './use-grip-playback';

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6 6.1a2 2 0 1 1 2.6 1.9c-.4.15-.6.5-.6.95v.55" />
      <line x1="8" y1="11.6" x2="8" y2="11.7" strokeWidth="2" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <line x1="1.5" y1="5" x2="14.5" y2="5" />
      <line x1="1.5" y1="11" x2="14.5" y2="11" />
      <rect x="4" y="3" width="4" height="4" />
      <rect x="8.5" y="9" width="4" height="4" />
    </svg>
  );
}

/**
 * The analyzer is the archetype of this world: one sheet carrying a plan view
 * (the track), a profile view beneath it (load and transfer on the lap's own
 * clock), a boxed minima table (the corners), the notes, and a revision bar
 * naming the data it was drawn from. The cross-reference is what makes those
 * separate views one procedure, so the whole screen sits in one provider.
 */
export function GripSessionScreen() {
  return (
    <CrossRefProvider>
      <GripSessionPlate />
    </CrossRefProvider>
  );
}

function GripSessionPlate() {
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
  // the instant the pointer is over, which outranks the playback cursor for
  // every readout on the sheet while it is set
  const [hoverLocal, setHoverLocal] = useState<number | null>(null);
  const { setPosition } = useCrossRef();
  const ink = usePlateInk();

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      // through the shared cache, so the analyzer ↔ compare round-trip does not
      // re-download a multi-MB payload that is already in memory
      const full = await loadGripSession(sessionId);
      if (cancelled) return;
      if (!full) {
        setLoadError('Session not found.');
        return;
      }
      if (!isStoredGripData(full.data)) {
        setLoadError('This session’s stored data is unreadable. It may have been written by a newer version.');
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
  // cheaply below and 'render'-class settings just flow into props. Deferred so
  // dragging a recompute-class slider re-derives once it settles instead of on
  // every step: the derivation includes cross-lap turn matching and costs ~30 ms.
  const recomputeSig = useDeferredValue(RECOMPUTE_KEYS.map((k) => settings[k]).join(','));
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
  // Best apex demand per TRACK TURN across all laps. The "you have proven you
  // can" reference the spare flag compares against. Keying this on the per-lap
  // detection index instead compares unrelated bends: detection finds 6 to 9
  // corners on ten laps of the same circuit, and on the local fixture that made
  // the flag wrong on 10 of 74 rows, by up to 30 points against a 10-point
  // threshold. See turns.ts.
  const bestApexG = useMemo(
    () => (metric ? bestApexPerTurn(laps, (c) => cornerStats(c, metric).apex) : new Map<number, number>()),
    [laps, metric],
  );

  /** The lap's own path length, so the plan view can state a real scale. */
  const lapMetres = useMemo(() => {
    if (!analysis || !lap) return 0;
    let m = 0;
    for (let i = lap.start + 1; i <= lap.end; i++) {
      m += Math.hypot(analysis.px[i] - analysis.px[i - 1], analysis.py[i] - analysis.py[i - 1]);
    }
    return m;
  }, [analysis, lap]);

  const sampleHz = useMemo(() => {
    if (!analysis || analysis.n < 2) return null;
    const span = analysis.ch.t[analysis.n - 1] - analysis.ch.t[0];
    return span > 0 ? Math.round((analysis.n - 1) / span) : null;
  }, [analysis]);

  // Persist tuned settings, debounced; skip the initial load's setSettings.
  const persistArmed = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (!persistArmed.current) {
      persistArmed.current = true;
      return;
    }
    const timer = setTimeout(() => {
      // the stored copy is now stale for compare, which reads the same cache
      invalidateGripSession(session.id);
      gripSessionRepository.update(session.id, { settings }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [settings, session]);

  const changeSetting = useCallback((key: GripSettingKey, value: number) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  // a hover index from the previous lap means nothing on this one
  useEffect(() => { setHoverLocal(null); }, [lap?.num, sessionId]);

  const readIdx = hoverLocal ?? playback.cursor;

  // One instant, published once, read by every view on the sheet.
  useEffect(() => {
    if (!analysis || !lap) return;
    const i = Math.max(lap.start, Math.min(lap.end, lap.start + readIdx));
    setPosition({
      at: analysis.ch.t[i] - analysis.ch.t[lap.start],
      source: hoverLocal != null ? 'pointer' : 'playback',
    });
  }, [analysis, lap, readIdx, hoverLocal, setPosition]);

  function saveLabel() {
    if (!session) return;
    const next = label.trim() || null;
    if (next === session.label) return;
    setSession({ ...session, label: next });
    invalidateGripSession(session.id);
    gripSessionRepository.update(session.id, { label: next }).catch(() => {});
  }

  function setVehicle(vehicleId: string) {
    if (!session) return;
    const next = vehicleId || null;
    setSession({ ...session, vehicle_id: next });
    invalidateGripSession(session.id);
    gripSessionRepository.update(session.id, { vehicle_id: next }).catch(() => {});
  }

  // Space = play/pause, ←/→ = scrub (±1 s with shift), Esc = close drawer,
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
      <Plate>
        <Advisory>{loadError}</Advisory>
        <PlateLink to="/grip">Back to Grip sessions</PlateLink>
      </Plate>
    );
  }
  if (!session || !analysis || !lap || !metric || !dynC) {
    return <p className="t-annotation py-16 text-center">Loading session…</p>;
  }

  const globalCursor = lap.start + readIdx;
  const activeCorner = lap.corners.find((c) => globalCursor >= c.l && globalCursor <= c.r) ?? null;
  const tCur = analysis.ch.t[globalCursor] - analysis.ch.t[lap.start];
  const hasEnvelope = analysis.fitSamples > 0;
  const vehicleLabel = vehicles.find((v) => v.id === session.vehicle_id)?.name;

  return (
    <Plate className="plate-issue">
      <TitleBlock
        ident={[session.config, session.session_date].filter(Boolean).join(' · ') || 'Grip session'}
        title={label.trim() || session.track || 'Untitled session'}
        meta={[
          { label: 'Track', value: session.track || <Na /> },
          {
            label: 'Best lap',
            value: session.best_lap_s != null ? formatLapTime(session.best_lap_s) : <Na title="No timed lap" />,
          },
          {
            label: 'Timed laps',
            value: (
              <>
                {laps.length}
                {analysis.turnCount > 0 && (
                  <span className="t-annotation ml-1.5">{analysis.turnCount} turns</span>
                )}
              </>
            ),
          },
          { label: 'Metric', value: metricModeName(mode) },
        ]}
        actions={
          <>
            <PlateLink
              to={`/grip/compare?sessions=${session.id}&laps=${session.id}:${lap.num}&ref=${session.id}:${lap.num}&m=${mode}`}
              variant="solid"
            >
              Compare laps
            </PlateLink>
            <PlateButton onClick={() => setDrawer('help')} title="Help and how it works" aria-label="Help and how it works">
              <HelpIcon />
              Notes
            </PlateButton>
            <PlateButton onClick={() => setDrawer('settings')} title="Settings" aria-label="Settings">
              <SettingsIcon />
            </PlateButton>
          </>
        }
      />

      {!hasEnvelope && (
        <Advisory>
          No traction envelope could be fitted to this session, so the session score reads n/a rather than zero.
          That is not an envelope of 0 g, it is the absence of one: too few samples survived the fit.
        </Advisory>
      )}

      {/* The one earned accent plane on this sheet: the reading the analyzer
          exists for. Nothing else on this screen may take it, and it is accent
          only when there is a reading, because an inverted plane carrying n/a
          would spend the emphasis on an absence.

          The lap count travels with the score and is not decoration: the
          envelope is max-preserving, so it can only grow with laps, measured at
          +8.3 points from 1 lap to 10 of identical riding. A score read without
          its budget is not comparable to anything.

          Nothing in here passes Readout a `unit`, and `Na` is kept out: both
          hard-code an inline ink-3, which an inverted plane cannot override. The
          unit lives in the label instead. */}
      <Zone label="Session score" note="traction envelope size, absolute" accent={hasEnvelope}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          {hasEnvelope ? (
            <Readout
              value={Math.round(analysis.sessionScore)}
              label={`Points over ${laps.length} lap${laps.length === 1 ? '' : 's'}`}
              note="100 would be working a full 1 g circle in every direction. Only comparable at equal lap count."
            />
          ) : (
            <NoReading
              label="Session score, points"
              reason="No traction envelope could be fitted, so there is no envelope to size."
            />
          )}
          {/* What qualifies the score, not what identifies the sheet: the title
              block already carries track, best lap and lap count. */}
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <dt className="t-annotation">Samples in the fit</dt>
              <dd className="t-data mt-1 text-sm">{analysis.fitSamples.toLocaleString('en')}</dd>
            </div>
            <div>
              <dt className="t-annotation">Tyre class</dt>
              <dd className="t-data mt-1 text-sm">{settings.anchorG.toFixed(2)} g</dd>
            </div>
            <div>
              <dt className="t-annotation">Track turns</dt>
              <dd className="t-data mt-1 text-sm">{analysis.turnCount}</dd>
            </div>
          </dl>
        </div>
      </Zone>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <LapTabs laps={laps} bestNum={bestLap(laps).num} activeNum={lap.num} onSelect={(l) => setLapNum(l.num)} />
        <PlateSegmented
          label="Colour metric"
          value={mode}
          options={[
            { value: 'grip', label: 'Grip' },
            { value: 'load', label: 'Dynamic load' },
          ]}
          onChange={setMode}
        />
      </div>

      {/* items-start: the plan view has a fixed aspect ratio, so a stretching
          column left a third of it as dead space beside the taller stack */}
      <div className="grid items-start gap-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <PlanView
            label={`Track map: ${metricModeName(mode).toLowerCase()}`}
            scale={`Lap ${Math.round(lapMetres)} m, north up`}
            legend={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="t-annotation">Demand</span>
                <span className="flex" aria-hidden="true">
                  {demandSwatches(ink, settings.anchorG).map((s) => (
                    <span key={s.g} className="h-3 w-7" style={{ background: s.color }} />
                  ))}
                </span>
                <span className="t-annotation">0 to tyre class {settings.anchorG.toFixed(2)} g</span>
                <span className="t-annotation">Ring marks the cursor</span>
              </div>
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
              xref={hoverLocal}
              onHover={setHoverLocal}
            />
          </PlanView>

          <ProfileView
            label="Profile: longitudinal g and transfer rate"
            axis={`Lap time, 0 to ${lap.time.toFixed(2)} s`}
          >
            <LoadTimeline
              analysis={analysis}
              lap={lap}
              cursor={playback.cursor}
              rateFS={settings.rateFS}
              onSeek={playback.scrub}
              xref={hoverLocal}
              onHover={setHoverLocal}
            />
          </ProfileView>

          <Zone label="Playback" flush>
            <TransportBar playback={playback} lapLength={lapLength} tCur={tCur} tTot={lap.time} />
          </Zone>
        </div>

        <div className="space-y-2">
          <Zone label="Traction circle" note="lateral by longitudinal g" flush>
            <TractionCircle
              analysis={analysis}
              lap={lap}
              cursor={playback.cursor}
              metric={metric}
              rateFS={settings.rateFS}
              anchorG={settings.anchorG}
              xref={hoverLocal}
              onHover={setHoverLocal}
            />
            <div className="rule-t flex flex-wrap gap-x-4 gap-y-1 px-3 py-1.5">
              <span className="t-annotation">Dashed inner boundary: your fitted envelope</span>
              <span className="t-annotation" style={{ color: 'var(--color-caution)' }}>
                Dotted ring: tyre class, an advisory, not a limit
              </span>
            </div>
          </Zone>

          <Zone
            label="Instant readout"
            note={
              activeCorner
                ? `in ${activeCorner.turn ? `turn ${activeCorner.turn}` : 'an extra bend'} (${activeCorner.dir === 'L' ? 'left' : 'right'})`
                : 'straight or transition'
            }
            flush
          >
            <TelemetryReadout
              analysis={analysis}
              lap={lap}
              cursor={readIdx}
              metric={metric}
              mode={mode}
              settings={settings}
            />
          </Zone>
        </div>
      </div>

      <CornerMinima
        lap={lap}
        liveStats={cornerLive}
        bestApexG={bestApexG}
        mode={mode}
        settings={settings}
        activeCorner={activeCorner?.ap ?? null}
        onSelect={(c: GripCorner) => playback.seek(c.ap - lap.start)}
      />

      <NotesBox>
        Scores are absolute: g demand × 100, so 100 is roughly 1 g, and they compare honestly between laps,
        sessions, bikes and riders. The traction envelope is descriptive, never a divisor: it is the boundary of
        what you actually did, and it can only grow with more laps, so the session score is only comparable at
        equal lap count. Longitudinal g is tyre demand, corrected for a fixed generic drag model rather than
        measured per bike. Lateral g comes from lean angle. Physics assumptions and every tunable estimate are
        in{' '}
        <button
          type="button"
          onClick={() => setDrawer('help')}
          className="underline underline-offset-2"
          style={{ color: 'var(--color-ink)', font: 'inherit' }}
        >
          Notes and how it works
        </button>{' '}
        and{' '}
        <button
          type="button"
          onClick={() => setDrawer('settings')}
          className="underline underline-offset-2"
          style={{ color: 'var(--color-ink)', font: 'inherit' }}
        >
          Settings
        </button>
        .
      </NotesBox>

      <Zone label="Session record" note="amends this sheet's identification">
        <div className="grid gap-3 sm:grid-cols-2">
          <PlateField label="Session label" id="grip-session-label" hint="Blank falls back to the track name">
            <input
              id="grip-session-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder={session.track || 'Untitled session'}
              className="field"
            />
          </PlateField>
          <PlateField
            label="Linked vehicle"
            id="grip-session-vehicle"
            hint={vehicleLabel ? undefined : 'Not linked to a vehicle yet'}
          >
            <select
              id="grip-session-vehicle"
              value={session.vehicle_id ?? ''}
              onChange={(e) => setVehicle(e.target.value)}
              className="field"
            >
              <option value="">No vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </PlateField>
        </div>
      </Zone>

      <RevisionBar
        entries={[
          { label: 'Data version', value: GRIP_DATA_VERSION },
          { label: 'Sample rate', value: sampleHz ? `${sampleHz} Hz` : <Na /> },
          { label: 'Samples', value: session.sample_count.toLocaleString('en') },
          { label: 'Timed laps', value: laps.length },
          { label: 'Source', value: 'RaceBox CSV export' },
          { label: 'Imported', value: formatRelativeTime(session.created_at) },
        ]}
      />

      <GripSettingsDrawer
        open={drawer !== null}
        initialTab={drawer ?? 'settings'}
        settings={settings}
        onChange={changeSetting}
        onReset={() => setSettings(DEFAULT_GRIP_SETTINGS)}
        onClose={() => setDrawer(null)}
      />
    </Plate>
  );
}
