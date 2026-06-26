import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { runRepository } from '@/api/repositories/run-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { shareRepository } from '@/api/repositories/share-repository';
import { ensureCurrentCurve, loadAnalyzedRun } from '@/analysis/re-analyze';
import type { AnalyzedRun } from '@/analysis/types';
import { PowerCurveChart, type CurveDisplayMode } from '@/ui/components/power-curve-chart';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { AccelTimesCard } from '@/ui/components/accel-times-card';
import { RunQualityBadge } from '@/ui/components/run-quality-badge';
import { useToast } from '@/ui/components/toast';
import { ConditionsModal } from '@/ui/run/conditions-modal';
import { ConditionsChips } from '@/ui/run/conditions-chips';
import { ExpertView } from '@/ui/run/expert-view';
import { useExpertView } from '@/ui/run/use-expert-view';
import { ToggleSwitch } from '@/ui/components/toggle-switch';
import type { Run, DerivedCurve, Vehicle, RunConditions } from '@/shared/types';
import { useReplayState, setPendingReplay } from '@/sensors/replay-state';
import { describeRecording } from '@/sensors/recording';
import { useUnits } from '@/app/units-context';
import { convertPower, formatPower, type PowerUnit } from '@/shared/format-power';
import { formatShortDateTime } from '@/shared/format-time';
import { shareRun, shareRunCard } from '@/app/share-image';

const CHART_MODE_OPTIONS = [
  { value: 'power', label: 'Power' },
  { value: 'torque', label: 'Torque' },
  { value: 'both', label: 'Both' },
] as const satisfies ReadonlyArray<{ value: CurveDisplayMode; label: string }>;

function oppositeUnit(unit: PowerUnit): PowerUnit {
  return unit === 'kW' ? 'hp' : 'kW';
}

function shareUrlFor(token: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/share/${token}`;
  }
  return `https://wasgoht.ch/share/${token}`;
}

function hasAnyCondition(c: RunConditions): boolean {
  return (
    typeof c.ambient_temp_c === 'number' ||
    typeof c.wind_kmh === 'number' ||
    typeof c.road_slope_pct === 'number' ||
    !!c.surface
  );
}

export function RunReviewScreen() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const units = useUnits();
  const toast = useToast();
  const [run, setRun] = useState<Run | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [curve, setCurve] = useState<DerivedCurve | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzedRun | null>(null);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [chartMode, setChartMode] = useState<CurveDisplayMode>('power');
  const [expert, setExpert] = useExpertView();
  const [prevBest, setPrevBest] = useState<number | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const { last: lastRecording } = useReplayState();
  const recordingMatchesRun = lastRecording?.meta.run_id === runId;

  useEffect(() => {
    (async () => {
      const r = await runRepository.get(runId);
      const c = await derivedCurveRepository.getByRun(runId);
      const ensured = await ensureCurrentCurve(runId, c);
      setRun(r);
      setCurve(ensured);
      if (r) {
        setNotes(r.notes);
        setTitle(r.title ?? `${r.gear_label} · ${formatShortDateTime(r.started_at)}`);
        const v = await vehicleRepository.get(r.vehicle_id);
        setVehicle(v);
      }
      // accel-times + quality aren't in the persisted DerivedCurve, so
      // re-run analyzeRun in-memory from raw samples.
      const a = await loadAnalyzedRun(runId);
      setAnalyzed(a);
    })();
  }, [runId]);

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    (async () => {
      const siblings = await runRepository.listByVehicle(run.vehicle_id);
      if (cancelled) return;
      const best = siblings
        .filter((s) => s.status === 'complete' && s.id !== run.id && s.peak_power_kw != null)
        .reduce<number | null>((acc, s) => {
          const pk = s.peak_power_kw;
          if (pk == null) return acc;
          return acc == null || pk > acc ? pk : acc;
        }, null);
      setPrevBest(best);
    })();
    return () => {
      cancelled = true;
    };
  }, [run]);

  const peak = useMemo(() => {
    if (!curve || curve.points.length === 0) return null;
    return curve.points.reduce(
      (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
      curve.points[0],
    );
  }, [curve]);

  const peakTorque = useMemo(() => {
    if (!curve || curve.points.length === 0) return null;
    return curve.points.reduce(
      (best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best),
      curve.points[0],
    );
  }, [curve]);

  const powerBand = useMemo(() => {
    if (!curve || curve.points.length === 0 || !peak) return null;
    const threshold = peak.wheel_power_kw * 0.8;
    const inBand = curve.points.filter((p) => p.wheel_power_kw >= threshold);
    if (inBand.length === 0) return null;
    const rpms = inBand.map((p) => p.rpm);
    return { lo: Math.min(...rpms), hi: Math.max(...rpms) };
  }, [curve, peak]);

  if (!run || !curve) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-zinc-500 text-sm">Loading…</p>
      </div>
    );
  }

  async function save() {
    if (!run) return;
    await runRepository.update(run.id, { title, notes });
    await runRepository.markComplete(run.id);
    navigate(`/vehicles/${run.vehicle_id}`);
  }

  async function discard() {
    if (!run) return;
    await runRepository.markAborted(run.id);
    navigate(`/vehicles/${run.vehicle_id}`);
  }

  function downloadRecording() {
    if (!lastRecording) return;
    const blob = new Blob([JSON.stringify(lastRecording, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = lastRecording.recorded_at.replace(/[:.]/g, '-');
    a.download = `dynorun-${lastRecording.kind}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function useRecordingForReplay() {
    if (!lastRecording) return;
    setPendingReplay(lastRecording);
    navigate('/replay/local');
  }

  function exportCsv() {
    if (!run) return;
    const header = 'rpm,wheel_power_kw,wheel_torque_nm';
    const rows = curve!.points.map((p) => `${p.rpm},${p.wheel_power_kw},${p.wheel_torque_nm}`);
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (run.title || title || `dynorun-${run.id.slice(0, 8)}`)
      .replace(/[^a-z0-9-]+/gi, '-')
      .toLowerCase();
    a.download = `${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to false; caller surfaces a toast either way.
    }
    return false;
  }

  async function createShareLink() {
    if (!run || shareBusy) return;
    setShareBusy(true);
    try {
      const res = await shareRepository.createToken(run.id);
      setRun({ ...run, share_token: res.token });
      const copied = await copyToClipboard(res.url);
      toast.show(
        copied ? 'Public link copied to clipboard' : 'Public link created',
        { variant: 'success' },
      );
    } catch {
      // apiFetch already broadcast the error to the toast subject.
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareLink() {
    if (!run?.share_token) return;
    const copied = await copyToClipboard(shareUrlFor(run.share_token));
    if (copied) toast.show('Public link copied', { variant: 'success' });
    else toast.show('Could not copy link', { variant: 'error' });
  }

  async function revokeShareLink() {
    if (!run?.share_token || shareBusy) return;
    if (!window.confirm('Revoke the public link? The current URL will stop working.')) return;
    setShareBusy(true);
    try {
      await shareRepository.revokeToken(run.id);
      setRun({ ...run, share_token: null });
      toast.show('Public link revoked', { variant: 'success' });
    } catch {
      // toast surfaced via apiErrors$
    } finally {
      setShareBusy(false);
    }
  }

  async function saveConditions(next: RunConditions) {
    if (!run) return;
    try {
      await runRepository.update(run.id, { conditions: next });
      setRun({ ...run, conditions: next });
      toast.show('Conditions saved', { variant: 'success' });
    } catch (err) {
      toast.show('Could not save conditions', { variant: 'error' });
      throw err;
    }
  }

  async function share() {
    if (!peak || !run || !curve) {
      exportCsv();
      return;
    }
    const titleStr = title || `${run.gear_label} run`;
    const text = `Peak ${units.format(peak.wheel_power_kw)} @ ${peak.rpm.toFixed(0)} RPM`;
    try {
      await shareRunCard(
        {
          title: titleStr,
          text,
          vehicleName: vehicle?.name ?? 'Vehicle',
          gearLabel: run.gear_label,
          unit: units.unit,
          peakPowerKw: peak.wheel_power_kw,
          peakTorqueNm: peakTorque?.wheel_torque_nm ?? null,
          peakPowerRpm: peak.rpm,
          curvePoints: curve.points,
          accelTimes: analyzed?.accel_times ?? null,
          conditions: run.conditions,
        },
        () => shareRun({ title: titleStr, text }, exportCsv),
      );
    } catch {
      await shareRun({ title: titleStr, text }, exportCsv);
    }
  }

  const opp = oppositeUnit(units.unit);
  const currentPeakKw = peak?.wheel_power_kw ?? null;
  const isFirstRun = prevBest == null;
  const isNewBest = currentPeakKw != null && prevBest != null && currentPeakKw > prevBest;
  const diffKw = currentPeakKw != null && prevBest != null ? currentPeakKw - prevBest : null;
  const diffDisplay = diffKw != null
    ? (() => {
        const converted = convertPower(diffKw, units.unit);
        const sign = converted > 0 ? '+' : '';
        const decimals = units.unit === 'kW' ? 1 : 0;
        return `${sign}${converted.toFixed(decimals)} ${units.unit}`;
      })()
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-zinc-100">Run review</h1>
        {analyzed && <RunQualityBadge quality={analyzed.quality} />}
      </div>

      {/* Peak stats — 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak power</p>
          <p className="tabular-nums">
            <span className="text-3xl font-bold text-amber-400">
              {peak ? formatPower(peak.wheel_power_kw, units.unit, { unitSuffix: false }) : '—'}
            </span>
            <span className="text-sm text-zinc-400 ml-1">{units.unit}</span>
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            {peak ? formatPower(peak.wheel_power_kw, opp) : '—'}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak torque</p>
          <p className="tabular-nums">
            <span className="text-3xl font-bold text-zinc-100">
              {peakTorque ? peakTorque.wheel_torque_nm.toFixed(0) : '—'}
            </span>
            <span className="text-sm text-zinc-400 ml-1">Nm</span>
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            {peakTorque ? `@ ${peakTorque.rpm.toFixed(0)} RPM` : '—'}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Power band</p>
          <p className="tabular-nums">
            <span className="text-2xl font-bold text-zinc-100">
              {powerBand
                ? powerBand.lo === powerBand.hi
                  ? `${powerBand.lo}`
                  : `${powerBand.lo}–${powerBand.hi}`
                : '—'}
            </span>
            <span className="text-sm text-zinc-400 ml-1">RPM</span>
          </p>
          <p className="text-zinc-600 text-xs mt-1">≥80% of peak</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Δ vs best</p>
          {isFirstRun ? (
            <>
              <p className="text-lg font-bold text-amber-400">First run</p>
              <p className="text-zinc-600 text-xs mt-1">Personal best</p>
            </>
          ) : isNewBest ? (
            <>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">{diffDisplay}</p>
              <p className="text-emerald-500 text-xs mt-1">New personal best</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-zinc-400 tabular-nums">{diffDisplay ?? '—'}</p>
              <p className="text-zinc-600 text-xs mt-1">vs your best</p>
            </>
          )}
        </div>
      </div>

      {analyzed && <AccelTimesCard accel={analyzed.accel_times} />}

      {/* Chart mode toggle + expert switch */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <SegmentedControl<CurveDisplayMode>
          options={CHART_MODE_OPTIONS}
          value={chartMode}
          onChange={setChartMode}
          ariaLabel="Chart mode"
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-widest">
          Expert
          <ToggleSwitch checked={expert} onChange={setExpert} ariaLabel="Expert view" />
        </label>
      </div>

      {/* Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
        <PowerCurveChart
          series={[{ label: 'Power', points: curve.points }]}
          mode={chartMode}
          unit={units.unit}
        />
      </div>

      {expert && analyzed && (
        <ExpertView
          roadLoad={analyzed.road_load}
          breakdown={analyzed.breakdown}
          peakRpm={peak?.rpm ?? null}
          unit={units.unit}
        />
      )}

      {/* Raw sensor recording */}
      {recordingMatchesRun && lastRecording && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Raw sensor recording</p>
            <p className="text-zinc-400 text-xs mt-1.5 font-mono">{describeRecording(lastRecording)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadRecording}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
            >
              Download JSON
            </button>
            <button
              onClick={useRecordingForReplay}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
            >
              Use for replay
            </button>
          </div>
        </div>
      )}

      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="run-title" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Title</label>
        <input
          id="run-title"
          type="text"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm"
          value={title}
          placeholder="Give this run a name"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="run-notes" className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Notes</label>
        <textarea
          id="run-notes"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition-colors text-sm resize-none"
          rows={3}
          value={notes}
          placeholder="Modifications, observations…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Conditions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Conditions</p>
          {hasAnyCondition(run.conditions) && (
            <button
              type="button"
              onClick={() => setConditionsOpen(true)}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              Edit
            </button>
          )}
        </div>
        {hasAnyCondition(run.conditions) ? (
          <ConditionsChips conditions={run.conditions} size="md" />
        ) : (
          <div className="space-y-3">
            <p className="text-zinc-500 text-xs">
              Log temp, wind, tires, or surface to make this run comparable later.
            </p>
            <button
              type="button"
              onClick={() => setConditionsOpen(true)}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
            >
              Add conditions
            </button>
          </div>
        )}
      </div>

      <ConditionsModal
        open={conditionsOpen}
        initial={run.conditions}
        onClose={() => setConditionsOpen(false)}
        onSave={saveConditions}
      />

      {/* Public share link */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Public link</p>
          <p className="text-zinc-500 text-xs mt-1.5">
            {run.share_token
              ? 'Anyone with this URL can view the run — no sign-in required.'
              : 'Generate a read-only URL anyone can open.'}
          </p>
        </div>
        {run.share_token ? (
          <>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                readOnly
                value={shareUrlFor(run.share_token)}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-200 text-xs font-mono focus:outline-none focus:border-amber-500"
                aria-label="Public share URL"
              />
              <button
                onClick={copyShareLink}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium px-3 rounded-xl transition-colors text-xs border border-zinc-700 whitespace-nowrap"
              >
                Copy
              </button>
            </div>
            <button
              onClick={revokeShareLink}
              disabled={shareBusy}
              className="w-full bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 font-medium py-2 rounded-xl transition-colors text-xs border border-zinc-700 disabled:opacity-50"
            >
              Revoke link
            </button>
          </>
        ) : (
          <button
            onClick={createShareLink}
            disabled={shareBusy}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700 disabled:opacity-50"
          >
            {shareBusy ? 'Creating…' : 'Get public link'}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <button
            onClick={save}
            className="flex-1 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors"
          >
            Save run
          </button>
          <button
            onClick={discard}
            className="flex-1 bg-zinc-800 hover:bg-red-900/60 text-zinc-400 hover:text-red-300 font-medium py-3.5 rounded-xl transition-colors border border-zinc-700"
          >
            Discard
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportCsv}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
          >
            Export CSV
          </button>
          <button
            onClick={share}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm border border-zinc-700"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
