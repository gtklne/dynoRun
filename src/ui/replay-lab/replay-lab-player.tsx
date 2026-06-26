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

function NumField({
  label, value, onChange, step = 1, suffix, placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-zinc-500 text-[11px] uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1.5 mt-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 tabular-nums focus:border-amber-500 outline-none"
        />
        {suffix && <span className="text-zinc-500 text-xs shrink-0">{suffix}</span>}
      </div>
    </label>
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
      <div className="space-y-4">
        <button onClick={() => navigate('/replay')} className="text-zinc-400 hover:text-zinc-200 text-sm">← Replay Lab</button>
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-4">
          <p className="text-red-300 text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!recording) {
    return <div className="text-zinc-500 text-sm text-center py-12">Loading recording…</div>;
  }

  const rpmKnown = effectiveRollout != null;
  const isRun = recording.kind === 'run';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => navigate('/replay')} className="text-zinc-400 hover:text-zinc-200 text-sm">← Replay Lab</button>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
          isRun ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
        }`}>{recording.kind}</span>
      </div>

      <p className="text-zinc-500 text-xs font-mono">{describeRecording(recording)}</p>

      {/* Live readouts */}
      <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${progress.playing ? 'bg-red-500 animate-pulse' : 'bg-zinc-600'}`} />
          <span className="text-amber-400 text-xs font-semibold uppercase tracking-widest">
            Replay{progress.rate !== 1 ? ` · ${progress.rate}×` : ''}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Speed</p>
            <p className="tabular-nums">
              <span className="text-4xl font-bold text-zinc-100">{currentSpeedKmh.toFixed(0)}</span>
              <span className="text-sm text-zinc-500 ml-1">km/h</span>
            </p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">RPM</p>
            <p className="tabular-nums">
              <span className="text-3xl font-bold text-zinc-100">{rpmKnown ? currentRpm.toFixed(0) : '—'}</span>
            </p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Live peak</p>
            <p className="tabular-nums">
              <span className="text-2xl font-bold text-amber-400">{livePeakKw != null ? units.format(livePeakKw) : '—'}</span>
            </p>
          </div>
        </div>
        {zeroToHundred != null && (
          <div className="mt-3 pt-3 border-t border-zinc-800 flex items-baseline justify-between">
            <span className="text-zinc-500 text-xs uppercase tracking-wider">0–100 km/h</span>
            <span className="tabular-nums">
              <span className="text-2xl font-bold text-amber-400">{zeroToHundred.toFixed(1)}</span>
              <span className="text-xs text-zinc-400 ml-1">s</span>
            </span>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
        <StreamingChart ref={chartRef} />
      </div>

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

      {/* Parameters */}
      <details className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden group">
        <summary className="px-4 py-3 cursor-pointer select-none list-none flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Parameters</span>
          <span className="text-zinc-500 text-xs group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4 space-y-4">
          <div>
            <NumField label="Vehicle mass" value={massKg} onChange={setMassKg} step={10} suffix="kg" placeholder="enter mass" />
            <p className="text-zinc-600 text-[10px] mt-1">
              {massSource ? `from ${massSource}` : 'no linked vehicle — enter manually'}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500 text-[11px] uppercase tracking-wider">Rollout</span>
              <SegmentedControl<RolloutMode> options={ROLLOUT_MODE_OPTIONS} value={rolloutMode} onChange={setRolloutMode} compact />
            </div>
            {rolloutMode === 'direct' ? (
              <NumField label="m / rev" value={rolloutDirect} onChange={setRolloutDirect} step={0.001} suffix="m/rev" placeholder="e.g. 0.5" />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <NumField label="RPM" value={calRpm} onChange={setCalRpm} step={100} />
                <NumField label="Speed" value={calSpeedKmh} onChange={setCalSpeedKmh} step={1} suffix="km/h" />
              </div>
            )}
            <p className="text-zinc-600 text-[10px]">
              {rolloutSource ? `from ${rolloutSource}` : 'no linked calibration — enter manually'}
              {effectiveRollout != null ? ` · ${effectiveRollout.toFixed(4)} m/rev` : ''}
            </p>
          </div>

          <details className="border-t border-zinc-800 pt-3">
            <summary className="cursor-pointer select-none list-none text-zinc-500 text-[11px] uppercase tracking-wider">
              Road-load (advanced)
            </summary>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <label className="block">
                <span className="text-zinc-500 text-[11px] uppercase tracking-wider">Kind</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as VehicleKind)}
                  className="w-full mt-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100"
                >
                  <option value="car">car</option>
                  <option value="motorcycle">motorcycle</option>
                </select>
              </label>
              <NumField label="CdA coeff" value={cda} onChange={setCda} step={0.01} />
              <NumField label="Frontal area" value={fa} onChange={setFa} step={0.1} suffix="m²" />
            </div>
          </details>
        </div>
      </details>

      {/* Result */}
      <button
        onClick={() => setShowResult((s) => !s)}
        className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-medium py-2.5 rounded-xl transition-colors text-sm"
      >
        {showResult ? 'Hide result' : 'Show result'}
      </button>

      {showResult && (
        isRun ? (
          analyzed ? (
            <ReplayResultPanel kind="run" analyzed={analyzed} unit={units.unit} />
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
              <p className="text-zinc-400 text-sm">Enter vehicle mass and rollout to derive the curve.</p>
            </div>
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
  );
}
