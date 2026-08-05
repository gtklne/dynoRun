import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { unpackGripData } from '@/analysis/grip/storage';
import type { GripAnalysis } from '@/analysis/grip/types';
import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import { loadGripSession } from './grip-session-cache';
import type { GripSessionFull, GripSessionSummary } from '@/api/repositories/types';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { MAX_COMPARE_LAPS, deltaTextClass, formatDelta, seriesColor } from './compare-colors';
import { CompareDeltaChart } from './compare-delta-chart';
import { CompareEnvelopes, type EnvelopeSeries } from './compare-envelopes';
import { CompareLapPicker, lapKey, type PickerSession } from './compare-lap-picker';
import { CompareTrackMap } from './compare-track-map';
import { CompareTraceChart, TRACE_CHANNELS, type TraceChannel } from './compare-trace-chart';
import { CompareTurnTable } from './compare-turn-table';
import { formatLapTime } from './format-lap';
import { metricModeName, type GripMetricMode } from './metric-mode';

function Panel({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <span>{title}</span>
        {hint && <span className="font-normal normal-case tracking-normal">{hint}</span>}
      </h3>
      {children}
    </div>
  );
}

const sessionTitle = (s: GripSessionSummary) => s.label ?? s.track ?? 'Untitled session';
const sessionSubtitle = (s: GripSessionSummary) =>
  [s.label ? s.track : null, s.config, s.session_date].filter(Boolean).join(' · ') || '—';

export function GripCompareScreen() {
  const [params, setParams] = useSearchParams();
  const [library, setLibrary] = useState<GripSessionSummary[] | null>(null);
  const [loaded, setLoaded] = useState<Map<string, GripSessionFull>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionIds, setSessionIds] = useState<string[]>(
    () => (params.get('sessions') ?? '').split(',').filter(Boolean),
  );
  const [selected, setSelected] = useState<string[]>(() => (params.get('laps') ?? '').split(',').filter(Boolean));
  const [refKey, setRefKey] = useState<string | null>(params.get('ref') || null);
  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const [mode, setMode] = useState<GripMetricMode>(params.get('m') === 'grip' ? 'grip' : 'load');
  const [channel, setChannel] = useState<TraceChannel>('spd');
  const [cursor, setCursor] = useState(0);

  // The URL is the shareable artefact — a link reopens the same sessions, laps,
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

  useEffect(() => {
    const missing = sessionIds.filter((id) => !loaded.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const fetched: [string, GripSessionFull][] = [];
      for (const id of missing) {
        const full = await loadGripSession(id, library?.find((s2) => s2.id === id)?.updated_at);
        if (full) fetched.push([id, full]);
      }
      if (cancelled) return;
      setLoaded((prev) => {
        const next = new Map(prev);
        for (const [id, full] of fetched) next.set(id, full);
        return next;
      });
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
  const recomputeSig = RECOMPUTE_KEYS.map((k) => settings[k]).join(',');
  const analyses = useMemo(() => {
    const map = new Map<string, GripAnalysis>();
    for (const s of activeSessions) {
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

  // The reference is the fastest selected lap unless the rider picks another.
  useEffect(() => {
    if (refKey && selected.includes(refKey)) return;
    const best = selected
      .map((k) => ({ k, lap: lapOf(k) }))
      .filter((x) => x.lap)
      .sort((a, b) => a.lap!.time - b.lap!.time)[0];
    setRefKey(best?.k ?? null);
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

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    // the reference always takes the baseline colour, then selection order
    let next = 1;
    for (const key of selected) map.set(key, key === refKey ? seriesColor(0) : seriesColor(next++));
    return map;
  }, [selected, refKey]);

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

  const envelopeSeries = useMemo<(EnvelopeSeries & { score: number; sectors: ReturnType<typeof sectorScores>; laps: number })[]>(() => {
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
        color: colorOf.get(firstKey) ?? seriesColor(0),
        score: env.sessionScore,
        sectors: sectorScores(env.env),
        laps: budget,
      }];
    });
  }, [selected, analyses, activeSessions, settings, colorOf]);

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
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/grip" className="text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-300">
            ← Grip sessions
          </Link>
          <h1 className="mt-0.5 text-2xl font-bold text-zinc-100">Compare laps</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Laps are lined up by position on track, not by the clock — so the delta shows where the time actually went.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cmp && cmp.laps.length > 1 && (
            <select
              value={refKey ?? ''}
              onChange={(e) => setRefKey(e.target.value)}
              aria-label="Reference lap"
              className="max-w-[220px] rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-xs font-medium text-zinc-300 outline-none focus:border-sky-600"
            >
              {cmp.laps.map((l) => (
                <option key={l.key} value={l.key}>
                  Ref: {l.label} ({formatLapTime(l.lapTime)})
                </option>
              ))}
            </select>
          )}
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
      </header>

      {error && (
        <div className="rounded-2xl border border-red-800/60 bg-red-950/40 p-3">
          <p className="text-xs text-red-300">⚠ {error}</p>
        </div>
      )}

      <CompareLapPicker
        sessions={pickerSessions}
        selected={selected}
        colorOf={colorOf}
        refKey={refKey}
        onToggle={toggle}
        available={available}
        onAddSession={(id) => setSessionIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
        onRemoveSession={removeSession}
        loading={loading || library === null}
      />

      {diverged.length > 0 && (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-500">
          These sessions were tuned differently, so {diverged.length === 1 ? 'one setting' : `${diverged.length} settings`} fell
          back to the default for both — otherwise the channels would not be the same measurement.
          <span className="ml-1 font-mono text-zinc-600">{diverged.join(', ')}</span>
        </p>
      )}

      {excluded.map((l) => (
        <LayoutMismatch key={l.key} lap={l} reference={reference} />
      ))}

      {partial.map((l) => (
        <p key={l.key} className="rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-300/90">
          <b>{l.label}</b> shares {Math.round(l.sectionFraction * 100)}% of the reference lap —
          {' '}{Math.round(l.section.sIn)} m to {Math.round(l.section.sOut)} m. Beyond that the two are on different
          ground, so the delta stops there and no lap-time difference is shown; across the shared stretch it is{' '}
          <b className="font-mono">{formatDelta(l.sectionDelta)}s</b>.
        </p>
      ))}

      {bridged.map((l) => (
        <p key={l.key} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-500">
          <b>{l.label}</b> has a {l.maxGapM.toFixed(0)} m gap between GPS fixes; that stretch is interpolated, not measured.
        </p>
      ))}

      {!cmp || selected.length === 0 ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
          Pick at least one lap above.
        </p>
      ) : (
        <>
          <Legend cmp={cmp} colorOf={colorOf} refKey={refKey} theoreticalBest={segments?.theoreticalBest ?? null} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Panel
              title="Where the time went"
              hint={
                <span className="flex items-center gap-2 text-[11px] text-zinc-500">
                  gaining
                  <span className="h-2 w-20 rounded" style={{ background: 'linear-gradient(90deg,#38bdf8,#52525b,#fb7185)' }} />
                  losing
                </span>
              }
            >
              <CompareDeltaChart
                cmp={cmp}
                colorOf={colorOf}
                keys={alignedKeys}
                cursor={cursor}
                onSeek={setCursor}
              />
            </Panel>

            <Panel
              title="On track"
              hint={
                subjectKey && cmp.laps.length > 1 ? (
                  <select
                    value={subjectKey}
                    onChange={(e) => setSubjectKey(e.target.value)}
                    aria-label="Lap shown on the map"
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-1.5 py-1 text-[11px] text-zinc-300 outline-none focus:border-sky-600"
                  >
                    {aligned.filter((l) => !l.isReference).map((l) => (
                      <option key={l.key} value={l.key}>{l.label}</option>
                    ))}
                  </select>
                ) : null
              }
            >
              <CompareTrackMap
                cmp={cmp}
                subjectKey={subjectKey ?? ''}
                colorOf={colorOf}
                cursor={cursor}
                onSeek={setCursor}
              />
            </Panel>
          </div>

          <Panel
            title="Channel overlay"
            hint={
              <SegmentedControl
                ariaLabel="Trace channel"
                compact
                options={TRACE_CHANNELS}
                value={channel}
                onChange={setChannel}
              />
            }
          >
            <CompareTraceChart
              cmp={cmp}
              channel={channel}
              colorOf={colorOf}
              keys={alignedKeys}
              cursor={cursor}
              onSeek={setCursor}
            />
            <p className="mt-2 text-[11px] text-zinc-600">
              Cursor at {Math.round(cursor)} m of {Math.round(cmp.refLength)} m
              {channel === 'metric' && <> · {metricModeName(mode).toLowerCase()} in points (100 ≈ 1 g)</>}
              {' · '}← → to scrub, shift for 50 m
            </p>
          </Panel>

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

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel
              title="Traction envelope"
              hint={
                envelopeSeries.length
                  ? `fitted on ${envelopeSeries[0].laps} lap${envelopeSeries[0].laps === 1 ? '' : 's'} each`
                  : undefined
              }
            >
              <CompareEnvelopes series={envelopeSeries} anchorG={settings.anchorG} />
              <div className="mt-3 space-y-2">
                {envelopeSeries.map((s) => (
                  <div key={s.key} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        <span className="truncate text-[12px] text-zinc-300">{s.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-sm text-zinc-100">{Math.round(s.score)}</span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5 font-mono text-[11px] text-zinc-400">
                      {(['brake', 'left', 'right', 'accel'] as const).map((sec) => (
                        <span key={sec} className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-wider text-zinc-600">{SECTOR_LABEL[sec]}</span>
                          {Math.round(s.sectors[sec])}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Scores are absolute: 100 ≈ working a full 1 g circle. Both sides are fitted on the same number of laps,
                because the boundary can only grow with more laps.
              </p>
            </Panel>

            <Panel title="How the lap was spent" hint="metres of track">
              <div className="space-y-2.5">
                {aligned.map((l) => {
                  const duty = dutyMetres(cmp.s, l.grid);
                  return (
                    <div key={l.key} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf.get(l.key) }} />
                        <span className="truncate text-[12px] text-zinc-300">{l.label}</span>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-md border border-zinc-800">
                        <i className="bg-rose-500/70" style={{ width: `${(100 * duty.brake) / duty.total}%` }} />
                        <i className="bg-zinc-600/70" style={{ width: `${(100 * duty.coast) / duty.total}%` }} />
                        <i className="bg-emerald-500/70" style={{ width: `${(100 * duty.drive) / duty.total}%` }} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 font-mono text-[11px] text-zinc-400">
                        <span className="text-rose-400/90">{Math.round(duty.brake)} m brake</span>
                        <span className="text-zinc-500">{Math.round(duty.coast)} m coast</span>
                        <span className="text-emerald-400/90">{Math.round(duty.drive)} m drive</span>
                      </div>
                      <div className="mt-1 flex flex-wrap justify-between gap-x-3 font-mono text-[11px] text-zinc-500">
                        <span>{Math.round(duty.aboveG)} m over 0.8 g</span>
                        <span>{Math.round(duty.aboveLean)} m over 40°</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Metres, not percentages — a percentage would hide that one lap covers more ground than the other. Coast is
                where the tyre is neither driving nor braking, after the drag the tyre has to overcome is accounted for.
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function LayoutMismatch({ lap, reference }: { lap: CompareLapResult; reference: CompareLapResult | null }) {
  const note = reference ? paceNote(reference, lap) : null;
  return (
    <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 px-3 py-2.5">
      <p className="text-[12px] font-semibold text-rose-300">{lap.label} is not the same layout as the reference</p>
      <p className="mt-0.5 text-[11px] text-rose-200/80">
        Its lap measures {Math.round(lap.pathLength)} m and only {Math.round(lap.coverage * 100)}% of it follows the
        reference line, so a time delta would be meaningless. It is left out of the aligned panels.
        {note && (
          <>
            {' '}Comparable on pace only: {(note.subjectPace * 3.6).toFixed(1)} km/h average against{' '}
            {(note.refPace * 3.6).toFixed(1)} km/h, a {note.pacePct >= 0 ? '+' : '−'}
            {Math.abs(note.pacePct).toFixed(1)}% difference.
          </>
        )}
      </p>
    </div>
  );
}

function Legend({
  cmp,
  colorOf,
  refKey,
  theoreticalBest,
}: {
  cmp: NonNullable<ReturnType<typeof compareLaps>>;
  colorOf: Map<string, string>;
  refKey: string | null;
  theoreticalBest: number | null;
}) {
  const ref = cmp.laps.find((l) => l.isReference);
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {cmp.laps.map((l) => (
        <div
          key={l.key}
          className="flex min-w-[168px] flex-1 items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2"
        >
          <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colorOf.get(l.key) }} />
          <div className="min-w-0">
            <p className="truncate text-[12px] text-zinc-300">{l.label}</p>
            <p className="font-mono text-[13px] text-zinc-100 tabular-nums">
              {formatLapTime(l.lapTime)}
              {l.key !== refKey && Number.isFinite(l.finishDelta) && (
                <span className={`ml-1.5 text-[11px] ${deltaTextClass(l.finishDelta)}`}>
                  {formatDelta(l.finishDelta)}s
                </span>
              )}
              {l.key === refKey && <span className="ml-1.5 text-[10px] uppercase text-zinc-500">reference</span>}
            </p>
          </div>
        </div>
      ))}
      {theoreticalBest != null && ref && cmp.laps.length > 1 && (
        <div className="flex min-w-[168px] flex-1 items-center gap-2.5 rounded-xl border border-sky-900/50 bg-sky-950/20 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-wider text-sky-400/80">Best of these laps, joined up</p>
            <p className="font-mono text-[13px] text-sky-200 tabular-nums">
              {formatLapTime(theoreticalBest)}
              <span className="ml-1.5 text-[11px] text-sky-400/80">
                {formatDelta(theoreticalBest - ref.lapTime)}s
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
