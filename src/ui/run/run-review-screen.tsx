import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { runRepository } from '@/api/repositories/run-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { shareRepository } from '@/api/repositories/share-repository';
import { ensureCurrentCurve, loadRunAnalysis } from '@/analysis/re-analyze';
import type { AnalyzedRun, RawSpeedSample } from '@/analysis/types';
import { PowerCurveChart, type CurveDisplayMode } from '@/ui/components/power-curve-chart';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { AccelTimesCard } from '@/ui/components/accel-times-card';
import { RunQualityBadge } from '@/ui/components/run-quality-badge';
import { useToast } from '@/ui/components/toast';
import { ConditionsModal } from '@/ui/run/conditions-modal';
import { ConditionsChips } from '@/ui/run/conditions-chips';
import { ExpertView } from '@/ui/run/expert-view';
import { RawTraceCard } from '@/ui/run/raw-trace-card';
import { SignalVerdictBanner } from '@/ui/components/signal-verdict-banner';
import { assessSignal } from '@/analysis/signal-integrity';
import { useExpertView } from '@/ui/run/use-expert-view';
import { ToggleSwitch } from '@/ui/components/toggle-switch';
import type { Calibration, Run, DerivedCurve, Vehicle, RunConditions, RpmPoint } from '@/shared/types';
import { useReplayState, setPendingReplay } from '@/sensors/replay-state';
import { describeRecording } from '@/sensors/recording';
import { useUnits } from '@/app/units-context';
import { convertPower, formatPower, type PowerUnit } from '@/shared/format-power';
import { formatShortDateTime } from '@/shared/format-time';
import { shareRun, shareRunCard } from '@/app/share-image';
import { mpsToKmh } from '@/shared/units';
import {
  CrossRefProvider,
  CrossRefReadout,
  MinimaTable,
  Na,
  NotesBox,
  Plate,
  PlateButton,
  PlateField,
  Readout,
  RevisionBar,
  TitleBlock,
  Zone,
  useCrossRef,
  type MinimaColumn,
} from '@/ui/plate';

const CHART_MODE_OPTIONS = [
  { value: 'power', label: 'Power' },
  { value: 'torque', label: 'Torque' },
  { value: 'both', label: 'Both' },
] as const satisfies ReadonlyArray<{ value: CurveDisplayMode; label: string }>;

const PLAN_LABEL: Record<CurveDisplayMode, string> = {
  power: 'Power vs RPM',
  torque: 'Torque vs RPM',
  both: 'Power and torque vs RPM',
};

/**
 * Stopgap for a gap in `.plane-ink`: it remaps the label and annotation
 * registers onto the inverted ground but not the annotation *ink* itself, and
 * `Readout` sets its unit's colour inline from `--color-ink-3`, which no
 * descendant rule can beat. Left as-is that unit reads at 2.85:1 on the accent
 * plane. Overriding the property here is inherited by the inline style and
 * lands it at the same 7:1 the annotation register already gets. Delete this
 * the moment `src/index.css` covers `.plane-ink .na` and Readout's unit.
 */
const ACCENT_INK_3 = '[--color-ink-3:color-mix(in_srgb,var(--color-sheet)_68%,transparent)]';

function oppositeUnit(unit: PowerUnit): PowerUnit {
  return unit === 'kW' ? 'hp' : 'kW';
}

// A share link is a fixed, public, canonical web URL. It must be valid even
// when produced by the native app (whose origin is capacitor://). So it is NOT
// origin- or BASE_URL-derived. Keep in sync with server buildShareUrl().
function shareUrlFor(token: string): string {
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

/** Nearest curve bin to an RPM, so every view reports the same instant. */
function binAt(points: RpmPoint[], rpm: number | null): RpmPoint | null {
  if (rpm == null || points.length === 0) return null;
  return points.reduce(
    (best, p) => (Math.abs(p.rpm - rpm) < Math.abs(best.rpm - rpm) ? p : best),
    points[0],
  );
}

/**
 * The plan view of the procedure: the field the whole sheet is about. It owns
 * the cross-reference cursor, which every other view on this plate reads.
 */
function CurvePlan({
  points,
  mode,
  unit,
  rpmMin,
  rpmMax,
  actions,
}: {
  points: RpmPoint[];
  mode: CurveDisplayMode;
  unit: PowerUnit;
  rpmMin: number;
  rpmMax: number;
  actions?: ReactNode;
}) {
  const { setPosition } = useCrossRef();
  // Memoised because publishing the cursor re-renders this subtree on every
  // mouse move, and a fresh `series` array identity would tear down and
  // rebuild the uPlot instance under the cursor that produced it.
  const series = useMemo(() => [{ label: 'This run', points }], [points]);
  // A Zone rather than a PlanView: the channel switch and the expert toggle
  // belong in this block's own head band, and PlanView has no actions slot.
  // Floating them in a bare row above the plot was the one place on this sheet
  // where a control sat outside the block it drives.
  return (
    <Zone
      label={PLAN_LABEL[mode]}
      note={`${rpmMin.toFixed(0)}-${rpmMax.toFixed(0)} RPM, 100 RPM bins`}
      actions={actions}
      flush
    >
      <div className="p-1.5">
        <PowerCurveChart
          series={series}
          mode={mode}
          unit={unit}
          onCursor={(rpm) => setPosition(rpm == null ? null : { at: rpm, source: 'curve' })}
        />
      </div>
      <div className="rule-t">
        <CurveReadout points={points} unit={unit} />
      </div>
    </Zone>
  );
}

/** The aligned channel column at the cross-referenced RPM. */
function CurveReadout({ points, unit }: { points: RpmPoint[]; unit: PowerUnit }) {
  const { position } = useCrossRef();
  const bin = binAt(points, position?.at ?? null);
  return (
    <CrossRefReadout
      axisLabel="RPM"
      axisValue={bin ? bin.rpm.toFixed(0) : <Na />}
      idle="Move across the curve to read every channel at one RPM"
      channels={[
        {
          name: 'Wheel power',
          value: bin ? formatPower(bin.wheel_power_kw, unit, { unitSuffix: false }) : <Na />,
          unit,
        },
        {
          name: 'Wheel torque',
          value: bin ? bin.wheel_torque_nm.toFixed(0) : <Na />,
          unit: 'Nm',
        },
      ]}
    />
  );
}

/**
 * The profile view beneath the plan. It reports the same instant the curve
 * cursor is on, translated through the calibration's rollout: an RPM is a
 * speed, and a speed is a moment in the raw trace.
 */
function TraceProfile({
  samples,
  rolloutMPerRev,
}: {
  samples: RawSpeedSample[];
  rolloutMPerRev: number | null;
}) {
  const { position } = useCrossRef();

  const cursorTimeS = useMemo(() => {
    if (position == null || rolloutMPerRev == null || rolloutMPerRev <= 0) return null;
    if (samples.length < 2) return null;
    const targetMps = (position.at / 60) * rolloutMPerRev;
    const t0 = samples[0].t_ms;
    const hit = samples.find((s) => s.speed_mps >= targetMps);
    if (!hit) return null;
    return (hit.t_ms - t0) / 1000;
  }, [position, rolloutMPerRev, samples]);

  return <RawTraceCard samples={samples} cursorTimeS={cursorTimeS} />;
}

/** The minima table of RPM bins, with the cross-referenced bin selected. */
function BinTable({ points, unit }: { points: RpmPoint[]; unit: PowerUnit }) {
  const { position } = useCrossRef();
  const bin = binAt(points, position?.at ?? null);

  const columns: MinimaColumn<RpmPoint>[] = [
    { key: 'rpm', head: 'RPM', numeric: true, cell: (p) => p.rpm.toFixed(0) },
    {
      key: 'power',
      head: `Power (${unit})`,
      numeric: true,
      cell: (p) => formatPower(p.wheel_power_kw, unit, { unitSuffix: false }),
    },
    {
      key: 'torque',
      head: 'Torque (Nm)',
      numeric: true,
      cell: (p) => p.wheel_torque_nm.toFixed(0),
    },
  ];

  return (
    <MinimaTable
      columns={columns}
      rows={points}
      rowKey={(p) => String(p.rpm)}
      selectedKey={bin ? String(bin.rpm) : null}
      empty="No RPM bins were derived from this run"
    />
  );
}

export function RunReviewScreen() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const units = useUnits();
  const toast = useToast();
  const [run, setRun] = useState<Run | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [curve, setCurve] = useState<DerivedCurve | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzedRun | null>(null);
  const [rawSamples, setRawSamples] = useState<RawSpeedSample[] | null>(null);
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
        // The rollout is what ties the RPM axis to the speed trace, so the
        // cross-reference between plan and profile needs it.
        const cal = await calibrationRepository.get(r.calibration_id).catch(() => null);
        setCalibration(cal);
      }
      // accel-times + quality aren't in the persisted DerivedCurve, so
      // re-run analyzeRun in-memory from raw samples.
      const a = await loadRunAnalysis(runId);
      setAnalyzed(a?.analyzed ?? null);
      setRawSamples(a?.samples ?? null);
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

  const integrity = useMemo(
    () => (rawSamples && rawSamples.length > 1 ? assessSignal(rawSamples) : null),
    [rawSamples],
  );

  const powerBand = useMemo(() => {
    if (!curve || curve.points.length === 0 || !peak) return null;
    const threshold = peak.wheel_power_kw * 0.8;
    const inBand = curve.points.filter((p) => p.wheel_power_kw >= threshold);
    if (inBand.length === 0) return null;
    const rpms = inBand.map((p) => p.rpm);
    return { lo: Math.min(...rpms), hi: Math.max(...rpms) };
  }, [curve, peak]);

  const sampleRateHz = useMemo(() => {
    if (!rawSamples || rawSamples.length < 2) return null;
    const span = rawSamples[rawSamples.length - 1].t_ms - rawSamples[0].t_ms;
    if (span <= 0) return null;
    return ((rawSamples.length - 1) / span) * 1000;
  }, [rawSamples]);

  if (!run || !curve) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="t-annotation">Loading...</p>
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

  const corruptRun = integrity?.verdict === 'corrupt';
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

  const rpms = curve.points.map((p) => p.rpm);
  const rpmMin = rpms.length > 0 ? Math.min(...rpms) : 0;
  const rpmMax = rpms.length > 0 ? Math.max(...rpms) : 0;
  const rollout = calibration?.rollout_m_per_rev ?? null;
  const topSpeedKmh =
    rawSamples && rawSamples.length > 0
      ? mpsToKmh(Math.max(...rawSamples.map((s) => s.speed_mps)))
      : null;

  return (
    <CrossRefProvider>
      <Plate>
        <TitleBlock
          ident={vehicle?.name ?? undefined}
          title={title || 'Run review'}
          actions={analyzed ? <RunQualityBadge quality={analyzed.quality} /> : undefined}
          meta={[
            { label: 'Gear', value: run.gear_label },
            {
              label: 'Rollout',
              value: rollout != null ? `${rollout.toFixed(4)} m/rev` : <Na title="Calibration not loaded" />,
            },
            { label: 'Started', value: formatShortDateTime(run.started_at) },
            {
              label: 'Top speed',
              value: topSpeedKmh != null ? `${topSpeedKmh.toFixed(0)} km/h` : <Na />,
            },
          ]}
        />

        {integrity && integrity.verdict !== 'ok' && (
          <SignalVerdictBanner
            integrity={integrity}
            action={
              integrity.verdict === 'corrupt' ? (
                <PlateButton variant="procedure" className="w-full" onClick={discard}>
                  Discard and ride it again
                </PlateButton>
              ) : undefined
            }
          />
        )}

        {/* Desktop: the sheet in the wide left column, the marginal apparatus
            (metadata, conditions, actions) in the right rail. Mobile keeps the
            single-column reading order. */}
        <div className="plate-stack lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6 lg:items-start lg:space-y-0">
          <div className="plate-stack">
            {/* The one earned accent plane on this sheet: peak power is the
                single reading the whole screen exists for, so it gets the block
                and nothing shares it. The supporting figures stay on the sheet
                ground below, which is also where an `n/a` and a traffic light
                stay legible: neither survives solid ink on both plates. */}
            <Zone
              label="Peak power"
              note="wheel, this run"
              accent={peak != null}
              flush
              className={peak != null ? ACCENT_INK_3 : ''}
            >
              <div className="px-3 pb-3 pt-2.5">
                <Readout
                  size="xl"
                  label="Peak power"
                  unit={units.unit}
                  value={
                    peak ? (
                      formatPower(peak.wheel_power_kw, units.unit, { unitSuffix: false })
                    ) : (
                      <Na title="No positive drive power in this run" />
                    )
                  }
                  note={
                    peak
                      ? `${formatPower(peak.wheel_power_kw, opp)} at ${peak.rpm.toFixed(0)} RPM`
                      : 'No bin carried positive power'
                  }
                />
              </div>
            </Zone>

            {/* A ruled list, not a three-up tile grid: these are supporting
                readings under one primary figure, and the rules say so at
                every width without a breakpoint changing their meaning. */}
            <Zone label="Supporting readings" flush>
              <dl>
                <div className="flex items-baseline justify-between gap-4 px-3 py-2">
                  <div>
                    <dt className="t-annotation">Peak torque</dt>
                    <dd className="t-annotation mt-0.5">
                      {peakTorque ? `at ${peakTorque.rpm.toFixed(0)} RPM` : 'not derived'}
                    </dd>
                  </div>
                  <dd className="t-data text-lg">
                    {peakTorque ? (
                      <>
                        {peakTorque.wheel_torque_nm.toFixed(0)}
                        <span className="t-annotation ml-1">Nm</span>
                      </>
                    ) : (
                      <Na />
                    )}
                  </dd>
                </div>
                <div className="rule-t flex items-baseline justify-between gap-4 px-3 py-2">
                  <div>
                    <dt className="t-annotation">Power band</dt>
                    <dd className="t-annotation mt-0.5">at or above 80% of peak</dd>
                  </div>
                  <dd className="t-data text-lg">
                    {powerBand ? (
                      <>
                        {powerBand.lo === powerBand.hi
                          ? `${powerBand.lo}`
                          : `${powerBand.lo}-${powerBand.hi}`}
                        <span className="t-annotation ml-1">RPM</span>
                      </>
                    ) : (
                      <Na />
                    )}
                  </dd>
                </div>
                <div className="rule-t flex items-baseline justify-between gap-4 px-3 py-2">
                  <div>
                    <dt className="t-annotation">Delta vs your best</dt>
                    <dd className="t-annotation mt-0.5">
                      {isFirstRun
                        ? 'nothing to compare against yet'
                        : isNewBest
                          ? 'new personal best'
                          : 'against this vehicle'}
                    </dd>
                  </div>
                  {/* Gained or lost against your own best, which is exactly
                      what green and red mean everywhere else here. */}
                  <dd
                    className="t-data text-lg"
                    style={
                      diffKw == null || diffKw === 0
                        ? undefined
                        : { color: diffKw > 0 ? 'var(--color-go)' : 'var(--color-stop)' }
                    }
                  >
                    {isFirstRun ? 'First run' : (diffDisplay ?? <Na />)}
                  </dd>
                </div>
              </dl>
            </Zone>

            <CurvePlan
              points={curve.points}
              mode={chartMode}
              unit={units.unit}
              rpmMin={rpmMin}
              rpmMax={rpmMax}
              actions={
                <>
                  <SegmentedControl<CurveDisplayMode>
                    options={CHART_MODE_OPTIONS}
                    value={chartMode}
                    onChange={setChartMode}
                    compact
                    ariaLabel="Chart mode"
                  />
                  <label className="t-annotation flex items-center gap-2">
                    Expert
                    <ToggleSwitch checked={expert} onChange={setExpert} ariaLabel="Expert view" />
                  </label>
                </>
              }
            />

            {rawSamples && rawSamples.length > 1 && (
              <TraceProfile samples={rawSamples} rolloutMPerRev={rollout} />
            )}

            <Zone label="RPM bins" note="the curve as numbers, 100 RPM apart" flush>
              <BinTable points={curve.points} unit={units.unit} />
            </Zone>

            {analyzed && <AccelTimesCard accel={analyzed.accel_times} />}

            {expert && analyzed && (
              <ExpertView
                roadLoad={analyzed.road_load}
                breakdown={analyzed.breakdown}
                peakRpm={peak?.rpm ?? null}
                unit={units.unit}
              />
            )}

            <NotesBox title="What this measurement is worth">
              Wheel power here is estimated from GPS acceleration, the mass you entered, the
              calibrated gearing, and standing road-load assumptions. It is not a calibrated
              rolling-road dyno figure, and no driveline loss is added back. Treat it as a
              comparative reading: the honest question it answers is whether this run is better
              than your last one under the same conditions, not what the engine makes.
            </NotesBox>

            <RevisionBar
              entries={[
                { label: 'Pipeline', value: `v${curve.pipeline_version}` },
                {
                  label: 'Sample rate',
                  value: sampleRateHz != null ? `${sampleRateHz.toFixed(1)} Hz` : <Na />,
                },
                { label: 'Run started', value: formatShortDateTime(run.started_at) },
                { label: 'Bins', value: String(curve.points.length) },
              ]}
            />
          </div>

          <div className="plate-stack">
            {recordingMatchesRun && lastRecording && (
              <Zone label="Raw sensor recording" note={describeRecording(lastRecording)} flush>
                <div className="flex gap-2 px-3 py-2.5">
                  <PlateButton className="flex-1" onClick={downloadRecording}>
                    Download JSON
                  </PlateButton>
                  <PlateButton className="flex-1" onClick={useRecordingForReplay}>
                    Use for replay
                  </PlateButton>
                </div>
              </Zone>
            )}

            <Zone label="Run record">
              <div className="space-y-3">
                <PlateField id="run-title" label="Title">
                  <input
                    id="run-title"
                    type="text"
                    className="field"
                    value={title}
                    placeholder="Give this run a name"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </PlateField>

                <PlateField id="run-notes" label="Notes">
                  <textarea
                    id="run-notes"
                    className="field resize-none"
                    rows={3}
                    value={notes}
                    placeholder="Modifications, observations"
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </PlateField>
              </div>
            </Zone>

            <Zone
              label="Conditions"
              actions={
                hasAnyCondition(run.conditions) ? (
                  <PlateButton onClick={() => setConditionsOpen(true)} style={{ minHeight: 32 }}>
                    Edit
                  </PlateButton>
                ) : undefined
              }
            >
              {hasAnyCondition(run.conditions) ? (
                <ConditionsChips conditions={run.conditions} size="md" />
              ) : (
                <div className="space-y-2.5">
                  <p className="t-body text-[0.8125rem] leading-6">
                    Log temp, wind, tires, or surface to make this run comparable later.
                  </p>
                  <PlateButton className="w-full" onClick={() => setConditionsOpen(true)}>
                    Add conditions
                  </PlateButton>
                </div>
              )}
            </Zone>

            <Zone label="Public link" flush>
              <p className="t-body px-3 py-2.5 text-[0.8125rem] leading-6">
                {run.share_token
                  ? 'Anyone with this URL can view the run, no sign-in required.'
                  : 'Generate a read-only URL anyone can open.'}
              </p>
              {run.share_token ? (
                <div className="rule-t space-y-2 px-3 py-2.5">
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      readOnly
                      value={shareUrlFor(run.share_token)}
                      onFocus={(e) => e.currentTarget.select()}
                      className="field min-w-0 flex-1 text-xs"
                      aria-label="Public share URL"
                    />
                    <PlateButton onClick={copyShareLink}>Copy</PlateButton>
                  </div>
                  <PlateButton className="w-full" onClick={revokeShareLink} disabled={shareBusy}>
                    Revoke link
                  </PlateButton>
                </div>
              ) : (
                <div className="rule-t px-3 py-2.5">
                  <PlateButton className="w-full" onClick={createShareLink} disabled={shareBusy}>
                    {shareBusy ? 'Creating...' : 'Get public link'}
                  </PlateButton>
                </div>
              )}
            </Zone>

            <Zone label="Decision">
              <div className="space-y-2.5">
                {/* A corrupt run demotes Save to a secondary action rather than
                    removing it: the samples are still the rider's, and there are
                    honest reasons to keep one (comparing artifacts, filing a bug).
                    What it must not stay is the obvious default. */}
                <div className="flex gap-2.5">
                  <PlateButton
                    className="flex-1"
                    variant={corruptRun ? 'outline' : 'procedure'}
                    onClick={save}
                  >
                    {corruptRun ? 'Save anyway' : 'Save run'}
                  </PlateButton>
                  <PlateButton
                    className="flex-1"
                    variant={corruptRun ? 'procedure' : 'outline'}
                    onClick={discard}
                  >
                    Discard
                  </PlateButton>
                </div>
                <div className="flex gap-2.5">
                  <PlateButton className="flex-1" onClick={exportCsv}>
                    Export CSV
                  </PlateButton>
                  <PlateButton className="flex-1" onClick={share}>
                    Share
                  </PlateButton>
                </div>
              </div>
            </Zone>
          </div>
        </div>

        <ConditionsModal
          open={conditionsOpen}
          initial={run.conditions}
          onClose={() => setConditionsOpen(false)}
          onSave={saveConditions}
        />
      </Plate>
    </CrossRefProvider>
  );
}
