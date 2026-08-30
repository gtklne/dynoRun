import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { compareLaps, type CompareLapInput, type CompareLapResult } from '@/analysis/grip/compare';
import { RECOMPUTE_KEYS } from '@/analysis/grip/settings';
import {
  SECTOR_LABEL,
  compareSegments,
  dutyMetres,
  equalBudgetEnvelope,
  paceNote,
  resolveCompareSettings,
  sectorScores,
} from '@/analysis/grip/compare-stats';
import { computeCombined } from '@/analysis/grip/load';
import { isStoredGripData, unpackGripData } from '@/analysis/grip/storage';
import type { GripAnalysis } from '@/analysis/grip/types';
import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import { loadGripSession } from './grip-session-cache';
import type { GripSessionFull, GripSessionSummary } from '@/api/repositories/types';
import {
  Advisory,
  ChannelStrip,
  Na,
  NotesBox,
  Plate,
  PlanView,
  PlateButton,
  PlateField,
  PlateLink,
  PlateSegmented,
  TitleBlock,
  Zone,
  usePlateInk,
} from '@/ui/plate';
import {
  MAX_COMPARE_LAPS,
  deltaTextClass,
  formatDelta,
  seriesColor,
  seriesDash,
} from './compare-colors';
import { CompareDeltaChart } from './compare-delta-chart';
import { CompareEnvelopes, type EnvelopeSeries } from './compare-envelopes';
import { CompareLapPicker, lapKey, type PickerSession } from './compare-lap-picker';
import { CompareTrackMap } from './compare-track-map';
import { CompareTraceChart, TRACE_CHANNELS, type TraceChannel } from './compare-trace-chart';
import { CompareTurnTable } from './compare-turn-table';
import { formatLapTime } from './format-lap';
import { metricModeName, type GripMetricMode } from './metric-mode';

const sessionTitle = (s: GripSessionSummary) => s.label ?? s.track ?? 'Untitled session';
const sessionSubtitle = (s: GripSessionSummary) =>
  [s.label ? s.track : null, s.config, s.session_date].filter(Boolean).join(' · ') || 'n/a';

export function GripCompareScreen() {
  const [params, setParams] = useSearchParams();
  const ink = usePlateInk();
  const [library, setLibrary] = useState<GripSessionSummary[] | null>(null);
  const [loaded, setLoaded] = useState<Map<string, GripSessionFull>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionIds, setSessionIds] = useState<string[]>(
    () => (params.get('sessions') ?? '').split(',').filter(Boolean),
  );
  // Deduped and capped on the way in: `toggle` enforces MAX_COMPARE_LAPS but the
  // URL did not, and the series palette wraps modulo 6, a hand-edited link with
  // seven laps gave the seventh the reference's own ink and dash, and a repeated
  // key gave two traces one identity plus duplicate React keys.
  const [selected, setSelected] = useState<string[]>(() =>
    [...new Set((params.get('laps') ?? '').split(',').filter(Boolean))].slice(0, MAX_COMPARE_LAPS),
  );
  const [refKey, setRefKey] = useState<string | null>(params.get('ref') || null);
  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const [mode, setMode] = useState<GripMetricMode>(params.get('m') === 'grip' ? 'grip' : 'load');
  const [channel, setChannel] = useState<TraceChannel>('spd');
  const [cursor, setCursor] = useState(0);

  // The URL is the shareable artefact: a link reopens the same sessions, laps,
  // reference and metric. It is read once on mount and written from exactly one
  // place: two effects each cloning the params and calling setParams race, and
  // the loser silently drops the other's keys.
  useEffect(() => {
    const next = new URLSearchParams();
    const write = (key: string, value: string) => {
      if (value) next.set(key, value);
    };
    write('sessions', sessionIds.join(','));
    write('laps', selected.join(','));
    write('ref', refKey ?? '');
    write('m', mode);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIds, selected, refKey, mode]);

  useEffect(() => {
    gripSessionRepository
      .list()
      .then(setLibrary)
      .catch((e) => setError(String(e)));
  }, []);

  // No ?sessions= yet: open on the newest session so the screen is useful on
  // arrival instead of showing an empty picker.
  useEffect(() => {
    if (library && library.length > 0 && sessionIds.length === 0) setSessionIds([library[0].id]);
  }, [library, sessionIds.length]);

  // Ids that came back empty: a deleted session, or (because GET is
  // owner-scoped) any shared link opened by a different account. They must be
  // remembered: this effect depends on `loaded`, and unconditionally publishing a
  // new Map identity when nothing was fetched made it re-run forever, measured at
  // ~120 requests/second with a full re-analysis of every loaded session on each
  // pass and the picker stuck on "Loading sessions…".
  const unavailable = useRef<Set<string>>(new Set());
  const [missingIds, setMissingIds] = useState<string[]>([]);

  useEffect(() => {
    const missing = sessionIds.filter((id) => !loaded.has(id) && !unavailable.current.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const fetched: [string, GripSessionFull][] = [];
      const failed: string[] = [];
      for (const id of missing) {
        // wait for the library so `updated_at` is known and the cache can hit
        const full = await loadGripSession(id, library?.find((s2) => s2.id === id)?.updated_at);
        if (full) fetched.push([id, full]);
        else failed.push(id);
      }
      if (cancelled) return;
      for (const id of failed) unavailable.current.add(id);
      if (failed.length) setMissingIds((prev) => [...new Set([...prev, ...failed])]);
      if (fetched.length) {
        setLoaded((prev) => {
          const next = new Map(prev);
          for (const [id, full] of fetched) next.set(id, full);
          return next;
        });
      }
    })()
      .catch(() => setError('Could not load one of the sessions.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [sessionIds, loaded, library]);

  const activeSessions = useMemo(
    () => sessionIds.map((id) => loaded.get(id)).filter((s): s is GripSessionFull => !!s),
    [sessionIds, loaded],
  );

  const { settings, diverged } = useMemo(
    () => resolveCompareSettings(activeSessions.map((s) => s.settings)),
    [activeSessions],
  );

  // Only a 'recompute'-class setting change may re-derive channels; τ re-mixes
  // cheaply below and 'render'-class settings just flow into props.
  const recomputeSig = useDeferredValue(RECOMPUTE_KEYS.map((k) => settings[k]).join(','));
  const analyses = useMemo(() => {
    const map = new Map<string, GripAnalysis>();
    for (const s of activeSessions) {
      // the shape guard exists precisely for this; calling unpackGripData blind
      // let a stale or future envelope through into the pipeline
      if (!isStoredGripData(s.data)) continue;
      try {
        map.set(s.id, analyzeGripSession(unpackGripData(s.data), settings));
      } catch {
        // a session whose stored channels are unreadable is simply not offered
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessions, recomputeSig]);

  const dynamic = useMemo(() => {
    const map = new Map<string, Float32Array>();
    for (const [id, a] of analyses) map.set(id, computeCombined(a.comb, a.loadRate, settings.tau));
    return map;
  }, [analyses, settings.tau]);

  const pickerSessions = useMemo<PickerSession[]>(
    () =>
      activeSessions.map((s) => ({
        id: s.id,
        title: sessionTitle(s),
        subtitle: sessionSubtitle(s),
        laps: analyses.get(s.id)?.laps ?? [],
      })),
    [activeSessions, analyses],
  );

  // Preselect the two fastest laps of a newly added session, so opening the
  // screen already shows a comparison rather than an empty chart.
  const seeded = useRef(selected.length > 0);
  useEffect(() => {
    for (const ps of pickerSessions) {
      if (ps.laps.length === 0) continue;
      if (selected.some((k) => k.startsWith(`${ps.id}:`))) continue;
      // a shared link already chose its laps; only fill in what it did not
      if (seeded.current && !loaded.has(ps.id)) continue;
      seeded.current = true;
      const fastest = [...ps.laps].sort((a, b) => a.time - b.time);
      const want = (selected.length === 0 ? fastest.slice(0, 2) : fastest.slice(0, 1)).map((l) => lapKey(ps.id, l.num));
      setSelected((prev) => [...prev, ...want.filter((k) => !prev.includes(k))].slice(0, MAX_COMPARE_LAPS));
      return;
    }
  }, [pickerSessions, selected]);

  const lapOf = useCallback(
    (key: string) => {
      const [sid, num] = key.split(':');
      const a = analyses.get(sid);
      return a?.laps.find((l) => l.num === Number(num)) ?? null;
    },
    [analyses],
  );

  // Drop selection entries whose session loaded but whose lap does not exist,
  // a re-uploaded session with fewer laps, or a hand-edited link. Left in place
  // they consume a slot with no way to deselect them.
  useEffect(() => {
    setSelected((prev) => {
      const next = prev.filter((k) => !analyses.has(k.split(':')[0]) || !!lapOf(k));
      return next.length === prev.length ? prev : next;
    });
  }, [analyses, lapOf]);

  // The reference is the fastest selected lap unless the rider picks another.
  // It must be checked against laps that actually RESOLVED, not against the raw
  // URL text: compareLaps silently falls back to inputs[0] for an unknown refKey
  // while the turn table keeps looking up the original, so every per-turn delta
  // came out ±0.00 s / "Matched" while the delta chart above showed the real gap.
  useEffect(() => {
    const resolved = selected.map((k) => ({ k, lap: lapOf(k) })).filter((x) => x.lap);
    // nothing has loaded yet: keep whatever the shared link asked for
    if (resolved.length === 0) return;
    if (refKey && resolved.some((x) => x.k === refKey)) return;
    setRefKey([...resolved].sort((a, b) => a.lap!.time - b.lap!.time)[0].k);
  }, [selected, refKey, lapOf]);

  const inputs = useMemo<CompareLapInput[]>(() => {
    const out: CompareLapInput[] = [];
    for (const key of selected) {
      const [sid] = key.split(':');
      const a = analyses.get(sid);
      const lap = lapOf(key);
      const summary = activeSessions.find((s) => s.id === sid);
      if (!a || !lap || !summary) continue;
      const metric = mode === 'load' ? dynamic.get(sid) : a.comb;
      if (!metric) continue;
      out.push({
        key,
        label: `${sessionTitle(summary)} · Lap ${lap.num}`,
        sessionId: sid,
        analysis: a,
        lap,
        metric,
      });
    }
    return out;
  }, [selected, analyses, lapOf, activeSessions, dynamic, mode]);

  const cmp = useMemo(
    () => (inputs.length && refKey ? compareLaps(inputs, refKey) : null),
    [inputs, refKey],
  );

  // Series identity: the reference always takes index 0 (plain ink, solid), then
  // selection order. Colour and dash travel together, so six overlaid laps stay
  // separable for a colour-blind reader and in direct sun.
  const seriesIndex = useMemo(() => {
    const map = new Map<string, number>();
    let next = 1;
    for (const key of selected) map.set(key, key === refKey ? 0 : next++);
    return map;
  }, [selected, refKey]);
  const colorOf = useMemo(
    () => new Map([...seriesIndex].map(([k, i]) => [k, seriesColor(ink, i)])),
    [seriesIndex, ink],
  );
  const dashOf = useMemo(
    () => new Map([...seriesIndex].map(([k, i]) => [k, seriesDash(i)])),
    [seriesIndex],
  );

  const aligned = useMemo(() => cmp?.laps.filter((l) => l.verdict !== 'incompatible') ?? [], [cmp]);
  const alignedKeys = useMemo(() => aligned.map((l) => l.key), [aligned]);

  useEffect(() => {
    if (subjectKey && alignedKeys.includes(subjectKey) && subjectKey !== refKey) return;
    setSubjectKey(alignedKeys.find((k) => k !== refKey) ?? refKey);
  }, [alignedKeys, refKey, subjectKey]);

  useEffect(() => {
    if (cmp && cursor > cmp.refLength) setCursor(0);
  }, [cmp, cursor]);

  const segments = useMemo(() => (cmp ? compareSegments(cmp) : null), [cmp]);

  const envelopeSeries = useMemo<(Omit<EnvelopeSeries, 'color'> & {
    firstKey: string;
    score: number;
    sectors: ReturnType<typeof sectorScores>;
    laps: number;
  })[]>(() => {
    const ids = [...new Set(selected.map((k) => k.split(':')[0]))];
    const budget = ids.reduce((min, id) => Math.min(min, analyses.get(id)?.laps.length ?? 1), Infinity);
    if (!Number.isFinite(budget)) return [];
    return ids.flatMap((id) => {
      const a = analyses.get(id);
      const summary = activeSessions.find((s) => s.id === id);
      if (!a || !summary) return [];
      const env = equalBudgetEnvelope(a, settings, budget);
      const firstKey = selected.find((k) => k.startsWith(`${id}:`))!;
      return [{
        key: id,
        label: sessionTitle(summary),
        env: env.env,
        firstKey,
        score: env.sessionScore,
        sectors: sectorScores(env.env),
        laps: budget,
      }];
    });
    // deliberately NOT keyed on colorOf: the colour is looked up at render time,
    // so merely changing the reference lap cannot refit every session's envelope
  }, [selected, analyses, activeSessions, settings]);

  const envelopeColored = useMemo(
    () =>
      envelopeSeries.map((s) => ({
        ...s,
        color: colorOf.get(s.firstKey) ?? seriesColor(ink, 0),
        dash: dashOf.get(s.firstKey) ?? [],
      })),
    [envelopeSeries, colorOf, dashOf, ink],
  );

  const toggle = useCallback((key: string) => {
    setSelected((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : prev.length >= MAX_COMPARE_LAPS
          ? prev
          : [...prev, key],
    );
  }, []);

  const removeSession = useCallback(
    (id: string) => {
      setSelected((prev) => prev.filter((k) => !k.startsWith(`${id}:`)));
      setLoaded((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setSessionIds((prev) => prev.filter((x) => x !== id));
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (!cmp) return;
      const step = e.shiftKey ? 50 : 5;
      if (e.key === 'ArrowRight') setCursor((c) => Math.min(cmp.refLength, c + step));
      else if (e.key === 'ArrowLeft') setCursor((c) => Math.max(0, c - step));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cmp]);

  const available = useMemo(
    () => (library ?? []).filter((s) => !sessionIds.includes(s.id)),
    [library, sessionIds],
  );
  const reference = cmp?.laps.find((l) => l.isReference) ?? null;
  const excluded = cmp?.laps.filter((l) => l.verdict === 'incompatible') ?? [];
  const partial = cmp?.laps.filter((l) => l.verdict === 'partial') ?? [];
  const bridged = cmp?.laps.filter((l) => l.maxGapM > 15) ?? [];

  return (
    <Plate className="plate-issue">
      <TitleBlock
        ident="Grip Utilization"
        title="Compare laps"
        meta={[
          { label: 'Axis', value: 'Position on track, not the clock' },
          {
            label: 'Reference',
            value: reference ? `${formatLapTime(reference.lapTime)}` : <Na title="Nothing selected yet" />,
          },
          { label: 'Laps on sheet', value: `${selected.length} of ${MAX_COMPARE_LAPS}` },
          { label: 'Metric', value: metricModeName(mode) },
        ]}
        actions={
          <>
            {cmp && cmp.laps.length > 1 && (
              <select
                value={refKey ?? ''}
                onChange={(e) => setRefKey(e.target.value)}
                aria-label="Reference lap"
                className="field max-w-[16rem]"
                style={{ width: 'auto' }}
              >
                {cmp.laps.map((l) => (
                  <option key={l.key} value={l.key}>
                    Ref: {l.label} ({formatLapTime(l.lapTime)})
                  </option>
                ))}
              </select>
            )}
            <PlateSegmented
              label="Colour metric"
              value={mode}
              options={[
                { value: 'grip', label: 'Grip' },
                { value: 'load', label: 'Dynamic load' },
              ]}
              onChange={setMode}
            />
            <PlateLink to="/grip">Sessions</PlateLink>
          </>
        }
      />

      {error && <Advisory>{error}</Advisory>}

      {missingIds.length > 0 && (
        <Advisory>
          {missingIds.length === 1
            ? 'One session in this link is not available'
            : `${missingIds.length} sessions in this link are not available`}
          {': '}it may have been deleted, or it belongs to another account. The remaining laps are compared
          normally.{' '}
          <PlateButton
            onClick={() => {
              setSessionIds((prev) => prev.filter((id) => !missingIds.includes(id)));
              setSelected((prev) => prev.filter((k) => !missingIds.includes(k.split(':')[0])));
              setMissingIds([]);
            }}
            style={{ minHeight: 30, padding: '0.2rem 0.5rem', fontSize: '0.6875rem' }}
          >
            Remove from this comparison
          </PlateButton>
        </Advisory>
      )}

      <CompareLapPicker
        sessions={pickerSessions}
        selected={selected}
        colorOf={colorOf}
        dashOf={dashOf}
        refKey={refKey}
        onToggle={toggle}
        available={available}
        onAddSession={(id) => setSessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
        onRemoveSession={removeSession}
        loading={loading || library === null}
      />

      {diverged.length > 0 && (
        <Advisory tone="plain">
          These sessions were tuned differently, so {diverged.length === 1 ? 'one setting' : `${diverged.length} settings`}{' '}
          fell back to the default for both, otherwise the channels would not be the same measurement.{' '}
          <span className="t-data">{diverged.join(', ')}</span>
        </Advisory>
      )}

      {excluded.map((l) => (
        <LayoutMismatch key={l.key} lap={l} reference={reference} />
      ))}

      {partial.map((l) => (
        <Advisory key={l.key}>
          <b>{l.label}</b> shares {Math.round(l.sectionFraction * 100)}% of the reference lap,{' '}
          {Math.round(l.section.sIn)} m to {Math.round(l.section.sOut)} m. Beyond that the two are on different
          ground, so the delta stops there and no lap-time difference is shown; across the shared stretch it is{' '}
          <b>{formatDelta(l.sectionDelta)}s</b>. Everything outside that stretch is hatched on the charts.
        </Advisory>
      ))}

      {bridged.map((l) => (
        <Advisory key={l.key} tone="plain">
          <b>{l.label}</b> has a {l.maxGapM.toFixed(0)} m gap between GPS fixes; that stretch is interpolated,
          not measured.
        </Advisory>
      ))}

      {!cmp || selected.length === 0 ? (
        <div className="box-frame hatch px-3 py-10 text-center">
          <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
            Pick at least one lap above.
          </p>
        </div>
      ) : (
        <>
          <Legend
            cmp={cmp}
            colorOf={colorOf}
            dashOf={dashOf}
            refKey={refKey}
            theoreticalBest={segments?.theoreticalBest ?? null}
            referenceTotal={segments?.referenceTotal ?? null}
          />

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Zone
              label="Where the time went"
              note="slope, not height: an upward trace is losing time right there"
            >
              <CompareDeltaChart
                cmp={cmp}
                colorOf={colorOf}
                dashOf={dashOf}
                keys={alignedKeys}
                cursor={cursor}
                onSeek={setCursor}
              />
              <div className="rule-t flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                <span className="t-annotation" style={{ color: 'var(--color-gain)' }}>
                  Gaining
                </span>
                <span className="t-annotation">through neutral to</span>
                <span className="t-annotation" style={{ color: 'var(--color-procedure)' }}>
                  Losing
                </span>
                <span className="t-annotation">Hatched: not on every lap&rsquo;s section of track</span>
              </div>
            </Zone>

            <PlanView
              label="On track"
              scale={`Reference lap ${Math.round(cmp.refLength)} m, north up`}
              legend={
                subjectKey && cmp.laps.length > 1 ? (
                  <PlateField label="Lap shown on the map" id="compare-subject-lap">
                    <select
                      id="compare-subject-lap"
                      value={subjectKey}
                      onChange={(e) => setSubjectKey(e.target.value)}
                      className="field"
                    >
                      {aligned.filter((l) => !l.isReference).map((l) => (
                        <option key={l.key} value={l.key}>{l.label}</option>
                      ))}
                    </select>
                  </PlateField>
                ) : undefined
              }
            >
              <CompareTrackMap
                cmp={cmp}
                subjectKey={subjectKey ?? ''}
                colorOf={colorOf}
                dashOf={dashOf}
                cursor={cursor}
                onSeek={setCursor}
              />
            </PlanView>
          </div>

          <Zone
            label="Channel overlay"
            actions={
              <PlateSegmented
                label="Trace channel"
                value={channel}
                options={TRACE_CHANNELS}
                onChange={setChannel}
              />
            }
          >
            <CompareTraceChart
              cmp={cmp}
              channel={channel}
              colorOf={colorOf}
              dashOf={dashOf}
              keys={alignedKeys}
              cursor={cursor}
              onSeek={setCursor}
            />
            <p className="rule-t t-annotation px-3 py-2" style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
              Cursor at {Math.round(cursor)} m of {Math.round(cmp.refLength)} m
              {channel === 'metric' && <> · {metricModeName(mode).toLowerCase()} in points (100 ≈ 1 g)</>}
              {' · '}arrow keys to scrub, shift for 50 m
            </p>
          </Zone>

          {subjectKey && refKey && (
            <CompareTurnTable
              cmp={cmp}
              refKey={refKey}
              subjectKey={subjectKey}
              anchorG={settings.anchorG}
              cursor={cursor}
              onSelectTurn={setCursor}
            />
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Zone
              label="Traction envelope"
              note={
                envelopeSeries.length
                  ? `fitted on ${envelopeSeries[0].laps} lap${envelopeSeries[0].laps === 1 ? '' : 's'} each`
                  : undefined
              }
            >
              <CompareEnvelopes series={envelopeColored} anchorG={settings.anchorG} />
              <div>
                {envelopeColored.map((s) => (
                  <div key={s.key} className="rule-t px-3 py-2">
                    <ChannelStrip
                      color={s.color}
                      dash={s.dash}
                      name={s.label}
                      value={Math.round(s.score)}
                      unit="score"
                    />
                    <dl className="mt-1 grid grid-cols-4 gap-2 px-3">
                      {(['brake', 'left', 'right', 'accel'] as const).map((sec) => (
                        <div key={sec}>
                          <dt className="t-annotation">{SECTOR_LABEL[sec]}</dt>
                          <dd className="t-data mt-0.5 text-sm">{Math.round(s.sectors[sec])}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
              <p className="rule-t t-annotation px-3 py-2" style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
                Scores are absolute: 100 ≈ working a full 1 g circle. Both sides are fitted on the same number of
                laps, because the boundary can only grow with more laps.
              </p>
            </Zone>

            <Zone label="How the lap was spent" note="metres of track, never percentages">
              <div>
                {aligned.map((l, i) => {
                  // only the stretch this lap actually rode: outside its section
                  // every channel holds its last real value
                  const duty = dutyMetres(cmp.s, l.grid, { section: l.section });
                  // a lap whose common section collapsed has no metres to split
                  const pct = (v: number) => (duty.total > 0 ? (100 * v) / duty.total : 0);
                  return (
                    <div key={l.key} className={`px-3 py-2.5 ${i > 0 ? 'rule-t' : ''}`}>
                      <ChannelStrip
                        color={colorOf.get(l.key) ?? ink.ink}
                        dash={dashOf.get(l.key)}
                        name={l.label}
                        value={`${Math.round(duty.total)} m`}
                      />
                      <div
                        className="mt-1 flex h-3"
                        style={{ border: 'var(--rule-hair) solid var(--color-rule)' }}
                      >
                        <i style={{ width: `${pct(duty.brake)}%`, background: 'var(--color-procedure)' }} />
                        <i style={{ width: `${pct(duty.coast)}%`, background: 'var(--color-terrain)' }} />
                        <i style={{ width: `${pct(duty.drive)}%`, background: 'var(--color-gain)' }} />
                      </div>
                      <dl className="mt-1.5 grid grid-cols-3 gap-2">
                        <div>
                          <dt className="t-annotation" style={{ color: 'var(--color-procedure)' }}>Brake</dt>
                          <dd className="t-data mt-0.5 text-sm">{Math.round(duty.brake)} m</dd>
                        </div>
                        <div>
                          <dt className="t-annotation">Coast</dt>
                          <dd className="t-data mt-0.5 text-sm">{Math.round(duty.coast)} m</dd>
                        </div>
                        <div>
                          <dt className="t-annotation" style={{ color: 'var(--color-gain)' }}>Drive</dt>
                          <dd className="t-data mt-0.5 text-sm">{Math.round(duty.drive)} m</dd>
                        </div>
                      </dl>
                      <p className="t-annotation mt-1.5">
                        {Math.round(duty.aboveG)} m over 0.8 g · {Math.round(duty.aboveLean)} m over 40°
                        {l.sectionFraction < 0.98 && (
                          <> · over the {Math.round(duty.total)} m this lap shares with the reference, not a full lap</>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="rule-t t-annotation px-3 py-2" style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
                Metres, not percentages: a percentage would hide that one lap covers more ground than the other.
                Coast is where the tyre is neither driving nor braking, after the drag the tyre has to overcome is
                accounted for.
              </p>
            </Zone>
          </div>

          <NotesBox>
            Laps are lined up by position on track, not by the clock, so the delta shows where the time actually
            went. Where a lap left the reference layout its channels are masked rather than clamped, and every
            chart hatches that stretch: a held value outside a lap&rsquo;s own section is not a measurement.
            Nothing on this screen is stored, the URL is the artefact worth keeping.
          </NotesBox>
        </>
      )}
    </Plate>
  );
}

function LayoutMismatch({ lap, reference }: { lap: CompareLapResult; reference: CompareLapResult | null }) {
  const note = reference ? paceNote(reference, lap) : null;
  return (
    <Advisory>
      <b>{lap.label}</b> is not the same layout as the reference. Its lap measures{' '}
      {Math.round(lap.pathLength)} m and only {Math.round(lap.coverage * 100)}% of it follows the reference line,
      so a time delta would be meaningless. It is left out of the aligned panels.
      {note && (
        <>
          {' '}Comparable on pace only: {(note.subjectPace * 3.6).toFixed(1)} km/h average against{' '}
          {(note.refPace * 3.6).toFixed(1)} km/h, a {note.pacePct >= 0 ? '+' : '−'}
          {Math.abs(note.pacePct).toFixed(1)}% difference.
        </>
      )}
    </Advisory>
  );
}

function Legend({
  cmp,
  colorOf,
  dashOf,
  refKey,
  theoreticalBest,
  referenceTotal,
}: {
  cmp: NonNullable<ReturnType<typeof compareLaps>>;
  colorOf: Map<string, string>;
  dashOf: Map<string, number[]>;
  refKey: string | null;
  theoreticalBest: number | null;
  /** Σ of the reference's own segments: the only baseline on the same clock */
  referenceTotal: number | null;
}) {
  const ref = cmp.laps.find((l) => l.isReference);
  // `lapTime` comes from the RaceBox metadata, the segment sum from the spatial
  // axis: differencing the two reports a 0.05 s gain on real data even when the
  // reference lap won every single segment.
  const gain =
    theoreticalBest != null && referenceTotal != null && Number.isFinite(referenceTotal)
      ? theoreticalBest - referenceTotal
      : NaN;

  return (
    <Zone label="Lap times and deltas">
      {cmp.laps.map((l, i) => (
        <div key={l.key} className={`flex flex-wrap items-baseline gap-x-3 ${i > 0 ? 'rule-t' : ''}`}>
          <div className="min-w-0 flex-1">
            <ChannelStrip color={colorOf.get(l.key) ?? 'currentColor'} dash={dashOf.get(l.key)} name={l.label} />
          </div>
          <p className="t-data shrink-0 px-3 py-2 text-sm">
            {formatLapTime(l.lapTime)}
            {l.key !== refKey && Number.isFinite(l.finishDelta) && (
              <span className={`ml-2 ${deltaTextClass(l.finishDelta)}`}>{formatDelta(l.finishDelta)}s</span>
            )}
            {l.key === refKey && <span className="t-annotation ml-2">reference</span>}
          </p>
        </div>
      ))}
      {theoreticalBest != null && Number.isFinite(theoreticalBest) && ref && cmp.laps.length > 1 && (
        <div className="rule-t flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
          <span className="t-annotation">Best of these laps, joined up</span>
          <span className="t-data text-sm">
            {formatLapTime(theoreticalBest)}
            {Number.isFinite(gain) && (
              <span className={`ml-2 ${deltaTextClass(gain)}`}>{formatDelta(gain)}s vs ref</span>
            )}
          </span>
        </div>
      )}
    </Zone>
  );
}
