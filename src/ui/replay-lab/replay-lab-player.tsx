import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { recordingRepository, toSensorRecording } from '@/api/repositories/recording-repository';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { getPendingReplay } from '@/sensors/replay-state';
import { recordingSpeedSamples, describeRecording, type SensorRecording } from '@/sensors/recording';
import { ReplayPlayer, type ReplayProgress } from '@/run/replay-player';
import { AutoStopDetector } from '@/run/auto-stop-detector';
import { DEFAULT_AUTO_STOP_CONFIG } from '@/run/types';
import { analyzeRun } from '@/analysis/pipeline';
import { computeRollout } from '@/shared/units';
import { useUnits } from '@/app/units-context';
import { StreamingChart, type StreamingChartHandle } from '@/ui/components/streaming-chart';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { ReplayTransport } from './replay-lab-transport';
import { ReplayResultPanel } from './replay-lab-result';
import { ExpertView } from '@/ui/run/expert-view';
import { useExpertView } from '@/ui/run/use-expert-view';
import { ToggleSwitch } from '@/ui/components/toggle-switch';
import {
  Advisory,
  Na,
  PlateButton,
  PlateField,
  PlateLink,
  ProfileView,
  Readout,
  TitleBlock,
  Zone,
} from '@/ui/plate';
import type { VehicleKind } from '@/shared/types';
import type { RawSpeedSample } from '@/analysis/types';

type RolloutMode = 'direct' | 'point';

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Where a real run would have auto-stopped, for the timeline marker. Pure/read-only. */
function computeAutoStopTMs(samples: RawSpeedSample[]): number | null {
  const detector = new AutoStopDetector(DEFAULT_AUTO_STOP_CONFIG);
  let seenPositive = false;
  let prev: number | null = null;
  for (const s of samples) {
    if (prev !== null && s.speed_mps > prev) seenPositive = true;
    prev = s.speed_mps;
    detector.push({ t_ms: s.t_ms, speed_mps: s.speed_mps });
    if (seenPositive && detector.check(s.t_ms)) return s.t_ms;
  }
  return null;
}

function BackIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <polyline points="15 5 8 12 15 19" />
    </svg>
  );
}

function DisclosureIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      aria-hidden="true"
      className="transition-transform group-open:rotate-180"
    >
      <polyline points="5 9 12 16 19 9" />
    </svg>
  );
}

let fieldSeq = 0;

function NumField({
  label, value, onChange, step = 1, suffix, placeholder, hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  suffix?: string;
  placeholder?: string;
  hint?: string;
}) {
  // Stable across renders so the label stays bound to its own input.
  const idRef = useRef<string>();
  if (!idRef.current) idRef.current = `replay-field-${(fieldSeq += 1)}`;
  const id = idRef.current;

  return (
    <PlateField label={suffix ? `${label} (${suffix})` : label} id={id} hint={hint}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="field"
      />
    </PlateField>
  );
}

const ROLLOUT_MODE_OPTIONS: ReadonlyArray<{ value: RolloutMode; label: string }> = [
  { value: 'direct', label: 'Rollout' },
  { value: 'point', label: 'RPM + speed' },
];

export function ReplayLabPlayer() {
  const { recordingId = '' } = useParams();
  const navigate = useNavigate();
  const units = useUnits();

  const [recording, setRecording] = useState<SensorRecording | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Tunable analysis parameters (auto-filled from the linked vehicle/calibration when present).
  const [massKg, setMassKg] = useState<number | null>(null);
  const [massSource, setMassSource] = useState<string | null>(null);
  const [rolloutMode, setRolloutMode] = useState<RolloutMode>('direct');
  const [rolloutDirect, setRolloutDirect] = useState<number | null>(null);
  const [calRpm, setCalRpm] = useState<number | null>(null);
  const [calSpeedKmh, setCalSpeedKmh] = useState<number | null>(null);
  const [rolloutSource, setRolloutSource] = useState<string | null>(null);
  const [kind, setKind] = useState<VehicleKind>('car');
  const [cda, setCda] = useState<number | null>(null);
  const [fa, setFa] = useState<number | null>(null);

  // Live telemetry.
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [currentRpm, setCurrentRpm] = useState(0);
  const [livePeakKw, setLivePeakKw] = useState<number | null>(null);
  const [zeroToHundred, setZeroToHundred] = useState<number | null>(null);
  const [progress, setProgress] = useState<ReplayProgress>({ t_ms: 0, duration_ms: 0, playing: false, rate: 1 });
  const [showResult, setShowResult] = useState(false);
  const [expert, setExpert] = useExpertView();

  const chartRef = useRef<StreamingChartHandle>(null);
  const playerRef = useRef<ReplayPlayer | null>(null);
  const paramsRef = useRef<{ rollout: number | null; mass: number | null }>({ rollout: null, mass: null });
  const ringRef = useRef<{ t_ms: number; speed_mps: number }[]>([]);
  const startSampleRef = useRef<{ t_ms: number; speed_mps: number } | null>(null);
  const hundredCrossedRef = useRef(false);
  const scrubWasPlayingRef = useRef(false);

  const effectiveRollout = useMemo<number | null>(() => {
    if (rolloutMode === 'direct') return rolloutDirect && rolloutDirect > 0 ? rolloutDirect : null;
    if (calRpm != null && calRpm > 0 && calSpeedKmh != null) return computeRollout(calRpm, calSpeedKmh);
    return null;
  }, [rolloutMode, rolloutDirect, calRpm, calSpeedKmh]);

  useEffect(() => {
    paramsRef.current = { rollout: effectiveRollout, mass: massKg };
  }, [effectiveRollout, massKg]);

  // Resolve the recording (DB id, or in-memory pending for /replay/local).
  useEffect(() => {
    let cancelled = false;
    if (recordingId === 'local') {
      const pending = getPendingReplay();
      if (!pending) {
        navigate('/replay', { replace: true });
        return;
      }
      setRecording(pending);
      return;
    }
    (async () => {
      const full = await recordingRepository.get(recordingId);
      if (cancelled) return;
      if (!full) {
        setLoadError('Recording not found.');
        return;
      }
      setRecording(toSensorRecording(full));
    })();
    return () => { cancelled = true; };
  }, [recordingId, navigate]);

  // Auto-fill mass/rollout/road-load from the recording's linked vehicle + calibration.
  useEffect(() => {
    if (!recording) return;
    let cancelled = false;
    const { vehicle_id, calibration_id } = recording.meta;
    (async () => {
      if (vehicle_id) {
        const v = await vehicleRepository.get(vehicle_id);
        if (!cancelled && v) {
          setMassKg(v.mass_kg);
          setMassSource(v.name);
          setKind(v.kind);
          setCda(v.drag_coefficient);
          setFa(v.frontal_area_m2);
        }
      }
      if (calibration_id) {
        const c = await calibrationRepository.get(calibration_id);
        if (!cancelled && c) {
          setRolloutDirect(c.rollout_m_per_rev);
          setCalRpm(c.rpm);
          setCalSpeedKmh(c.speed_kmh);
          setRolloutSource(recording.meta.gear_label ?? 'calibration');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [recording]);

  // Create the player and auto-play. Callbacks read params from refs so editing
  // mass/rollout mid-playback takes effect without rebuilding the player.
  useEffect(() => {
    if (!recording) return;
    const resetLive = () => {
      ringRef.current = [];
      startSampleRef.current = null;
      hundredCrossedRef.current = false;
      setLivePeakKw(null);
      setZeroToHundred(null);
    };

    const player = new ReplayPlayer({
      fixes: recording.gps_fixes,
      durationMs: recording.duration_ms,
      onSample: (s) => {
        const { rollout, mass } = paramsRef.current;
        const rpm = rollout ? (s.speed_mps / rollout) * 60 : 0;
        setCurrentSpeedKmh(s.speed_kmh);
        setCurrentRpm(rpm);
        chartRef.current?.pushSample(s.t_ms, s.speed_kmh, rpm);

        const ring = ringRef.current;
        ring.push({ t_ms: s.t_ms, speed_mps: s.speed_mps });
        if (ring.length > 5) ring.shift();
        if (ring.length >= 2 && mass != null) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          const dt = (last.t_ms - first.t_ms) / 1000;
          if (dt > 0) {
            const a = (last.speed_mps - first.speed_mps) / dt;
            const p_kw = Math.max(0, mass * a * last.speed_mps) / 1000;
            setLivePeakKw((prev) => (prev == null || p_kw > prev ? p_kw : prev));
          }
        }

        if (!startSampleRef.current) startSampleRef.current = { t_ms: s.t_ms, speed_mps: s.speed_mps };
        if (!hundredCrossedRef.current && startSampleRef.current.speed_mps * 3.6 <= 5 && s.speed_kmh >= 100) {
          hundredCrossedRef.current = true;
          setZeroToHundred((s.t_ms - startSampleRef.current.t_ms) / 1000);
        }
      },
      onSeeked: (_t_ms, snapshot) => {
        chartRef.current?.reset();
        resetLive();
        const { rollout } = paramsRef.current;
        if (snapshot) {
          const rpm = rollout ? (snapshot.speed_mps / rollout) * 60 : 0;
          setCurrentSpeedKmh(snapshot.speed_kmh);
          setCurrentRpm(rpm);
          chartRef.current?.pushSample(snapshot.t_ms, snapshot.speed_kmh, rpm);
        } else {
          setCurrentSpeedKmh(0);
          setCurrentRpm(0);
        }
      },
      onProgress: setProgress,
      onEnded: () => setShowResult(true),
    });
    playerRef.current = player;
    player.play();
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, [recording]);

  const speedSamples = useMemo(
    () => (recording ? recordingSpeedSamples(recording.gps_fixes) : []),
    [recording],
  );

  const autoStopTMs = useMemo(
    () => (recording?.kind === 'run' ? computeAutoStopTMs(speedSamples) : null),
    [recording, speedSamples],
  );

  const analyzed = useMemo(() => {
    if (!recording || recording.kind !== 'run' || massKg == null || effectiveRollout == null) return null;
    return analyzeRun({
      samples: speedSamples,
      mass_kg: massKg,
      rollout_m_per_rev: effectiveRollout,
      kind,
      drag_coefficient: cda,
      frontal_area_m2: fa,
    });
  }, [recording, speedSamples, massKg, effectiveRollout, kind, cda, fa]);

  const steadySpeedKmh = useMemo(
    () => median(speedSamples.map((s) => s.speed_mps * 3.6)),
    [speedSamples],
  );
  const impliedRollout = useMemo(() => {
    const rpm = recording?.meta.user_rpm;
    return rpm != null && rpm > 0 && steadySpeedKmh > 0 ? computeRollout(rpm, steadySpeedKmh) : null;
  }, [recording, steadySpeedKmh]);

  if (loadError) {
    return (
      <div className="plate-stack">
        <TitleBlock
          title="Replay"
          actions={
            <PlateLink to="/replay">
              <BackIcon />
              Replay Lab
            </PlateLink>
          }
        />
        <Advisory>{loadError}</Advisory>
      </div>
    );
  }

  if (!recording) {
    return <p className="t-annotation py-12 text-center">Loading recording...</p>;
  }

  const rpmKnown = effectiveRollout != null;
  const isRun = recording.kind === 'run';

  return (
    <div className="plate-stack">
      <TitleBlock
        ident={describeRecording(recording)}
        title={isRun ? 'Run replay' : 'Calibration replay'}
        meta={[
          { label: 'Kind', value: recording.kind },
          {
            label: 'Mass',
            value: massKg != null ? `${massKg} kg` : <Na title="Enter a mass to derive power" />,
          },
          {
            label: 'Rollout',
            value:
              effectiveRollout != null ? (
                `${effectiveRollout.toFixed(4)} m/rev`
              ) : (
                <Na title="Enter a rollout to derive RPM" />
              ),
          },
          { label: 'Rate', value: `${progress.rate}×` },
        ]}
        actions={
          <PlateLink to="/replay">
            <BackIcon />
            Replay Lab
          </PlateLink>
        }
      />

      <div className="space-y-10 lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start lg:space-y-0">
        {/* LEFT: live player + transport */}
        <div className="space-y-6 lg:col-span-2">
          <Zone
            label="Live readout"
            note={progress.playing ? 'Playing' : 'Paused'}
          >
            <div className="grid grid-cols-3">
              <div className="px-3 py-3">
                <Readout value={currentSpeedKmh.toFixed(0)} unit="km/h" label="Speed" />
              </div>
              <div className="rule-l px-3 py-3">
                {rpmKnown ? (
                  <Readout value={currentRpm.toFixed(0)} unit="RPM" label="RPM" />
                ) : (
                  <div>
                    <p className="t-annotation">RPM</p>
                    <p className="t-readout na mt-1.5" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
                      n/a
                    </p>
                    <p className="t-annotation mt-1.5">No rollout set</p>
                  </div>
                )}
              </div>
              <div className="rule-l px-3 py-3">
                {livePeakKw != null ? (
                  <Readout value={units.format(livePeakKw)} label="Live peak" tone="procedure" />
                ) : (
                  <div>
                    <p className="t-annotation">Live peak</p>
                    <p className="t-readout na mt-1.5" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
                      n/a
                    </p>
                    <p className="t-annotation mt-1.5">Needs a mass</p>
                  </div>
                )}
              </div>
            </div>
            {zeroToHundred != null && (
              <div className="rule-t flex items-baseline justify-between px-3 py-2.5">
                <span className="t-annotation">0-100 km/h</span>
                <span className="t-data text-lg" style={{ color: 'var(--color-procedure)' }}>
                  {zeroToHundred.toFixed(1)}
                  <span className="t-annotation ml-1">s</span>
                </span>
              </div>
            )}
          </Zone>

          <ProfileView label="Speed and RPM vs time" axis="rolling 30 s window">
            <StreamingChart ref={chartRef} />
          </ProfileView>

          <ReplayTransport
            t_ms={progress.t_ms}
            duration_ms={progress.duration_ms}
            rate={progress.rate}
            autoStopTMs={autoStopTMs}
            onSetRate={(r) => playerRef.current?.setRate(r)}
            onRestart={() => { setShowResult(false); playerRef.current?.restart(); }}
            onScrubStart={() => {
              const p = playerRef.current;
              if (p) { scrubWasPlayingRef.current = p.getProgress().playing; p.stop(); }
            }}
            onScrub={(t) => playerRef.current?.seek(t)}
            onScrubEnd={() => { if (scrubWasPlayingRef.current) playerRef.current?.play(); }}
          />
        </div>

        {/* RIGHT: controls + output */}
        <div className="space-y-6 lg:col-span-1">
          <section aria-label="Analysis parameters">
            <details className="box-frame group">
              <summary className="flex cursor-pointer list-none select-none items-center justify-between px-3 py-2.5">
                <span className="t-label">Analysis parameters</span>
                <DisclosureIcon />
              </summary>
              <div className="rule-t space-y-4 px-3 py-3">
                <NumField
                  label="Vehicle mass"
                  value={massKg}
                  onChange={setMassKg}
                  step={10}
                  suffix="kg"
                  placeholder="enter mass"
                  hint={massSource ? `from ${massSource}` : 'no linked vehicle, enter manually'}
                />

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="t-annotation">Rollout</span>
                    <SegmentedControl<RolloutMode>
                      options={ROLLOUT_MODE_OPTIONS}
                      value={rolloutMode}
                      onChange={setRolloutMode}
                      ariaLabel="How to set the rollout"
                      compact
                    />
                  </div>
                  {rolloutMode === 'direct' ? (
                    <NumField
                      label="Rollout"
                      value={rolloutDirect}
                      onChange={setRolloutDirect}
                      step={0.001}
                      suffix="m/rev"
                      placeholder="e.g. 0.5"
                      hint={rolloutSource ? `from ${rolloutSource}` : 'no linked calibration, enter manually'}
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <NumField label="RPM" value={calRpm} onChange={setCalRpm} step={100} />
                      <NumField
                        label="Speed"
                        value={calSpeedKmh}
                        onChange={setCalSpeedKmh}
                        step={1}
                        suffix="km/h"
                        hint={rolloutSource ? `from ${rolloutSource}` : undefined}
                      />
                    </div>
                  )}
                  <p className="t-annotation">
                    Effective rollout{' '}
                    {effectiveRollout != null ? `${effectiveRollout.toFixed(4)} m/rev` : <Na />}
                  </p>
                </div>

                <details className="rule-t pt-3">
                  <summary className="t-annotation cursor-pointer select-none list-none">
                    Road load (advanced)
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <PlateField label="Kind" id="replay-kind">
                      <select
                        id="replay-kind"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as VehicleKind)}
                        className="field"
                      >
                        <option value="car">car</option>
                        <option value="motorcycle">motorcycle</option>
                      </select>
                    </PlateField>
                    <NumField label="CdA coeff" value={cda} onChange={setCda} step={0.01} />
                    <NumField label="Frontal area" value={fa} onChange={setFa} step={0.1} suffix="m²" />
                  </div>
                </details>
              </div>
            </details>
          </section>

          <PlateButton onClick={() => setShowResult((s) => !s)} aria-expanded={showResult} className="w-full">
            {showResult ? 'Hide result' : 'Show result'}
          </PlateButton>

          {showResult && isRun && analyzed && analyzed.points.length > 0 && (
            <div className="flex items-center justify-end gap-2">
              <span className="t-annotation">Expert</span>
              <ToggleSwitch checked={expert} onChange={setExpert} ariaLabel="Expert view" />
            </div>
          )}

          {showResult && (
            isRun ? (
              analyzed ? (
                <>
                  <ReplayResultPanel kind="run" analyzed={analyzed} unit={units.unit} />
                  {expert && analyzed.points.length > 0 && (
                    <ExpertView
                      roadLoad={analyzed.road_load}
                      breakdown={analyzed.breakdown}
                      peakRpm={null}
                      unit={units.unit}
                    />
                  )}
                </>
              ) : (
                <Zone label="Result">
                  <div className="hatch px-3 py-8 text-center">
                    <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
                      Enter vehicle mass and rollout to derive the curve
                    </p>
                  </div>
                </Zone>
              )
            ) : (
              <ReplayResultPanel
                kind="calibration"
                steadySpeedKmh={steadySpeedKmh}
                userRpm={recording.meta.user_rpm ?? null}
                impliedRollout={impliedRollout}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
