import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { runRepository } from '@/api/repositories/run-repository';
import { sampleRepository } from '@/api/repositories/sample-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { RunController } from '@/run/run-controller';
import { WakeLock } from '@/app/wake-lock';
import { useSpeedSourceFactory } from '@/ui/calibration/speed-source-context';
import { StreamingChart, type StreamingChartHandle } from '@/ui/components/streaming-chart';
import { mpsToKmh } from '@/shared/units';
import type { RunState } from '@/run/types';
import { setLastRecording } from '@/sensors/replay-state';
import { recordingRepository } from '@/api/repositories/recording-repository';
import { GpsWarmupCard, isGpsLocked, isGpsPoor } from '@/ui/components/gps-warmup-card';
import { CountdownOverlay } from '@/ui/components/countdown-overlay';
import { pulseStart, pulseStop } from '@/app/haptics';
import { useUnits } from '@/app/units-context';
import { useToast } from '@/ui/components/toast';

interface GpsState {
  accuracy_m: number | null;
  quality: number;
  fix_rate_hz: number;
  altitude_m: number | null;
  heading_deg: number | null;
}

export function LiveRunScreen() {
  const { vehicleId = '', calibrationId = '' } = useParams();
  const speedSourceFactory = useSpeedSourceFactory();
  const navigate = useNavigate();
  const { format } = useUnits();
  const toast = useToast();
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentRpm, setCurrentRpm] = useState(0);
  const [gps, setGps] = useState<GpsState | null>(null);
  const [warmupStartedAt] = useState<number>(() => Date.now());
  const [goodSince, setGoodSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [forceStart, setForceStart] = useState(false);
  const [countingDown, setCountingDown] = useState(false);
  const [livePeakKw, setLivePeakKw] = useState<number | null>(null);
  const [liveZeroToHundred, setLiveZeroToHundred] = useState<number | null>(null);
  const ctrlRef = useRef<RunController | null>(null);
  const chartRef = useRef<StreamingChartHandle>(null);
  const wakeLockRef = useRef(new WakeLock());
  const prevStateRef = useRef<RunState['kind']>('idle');
  const ringRef = useRef<{ t_ms: number; speed_mps: number }[]>([]);
  const massRef = useRef<number | null>(null);
  const startTimeRef = useRef<{ t_ms: number; speed_mps: number } | null>(null);
  const hundredCrossedRef = useRef(false);

  // Tick the clock so "lock progress" and "poor GPS" timers update even
  // when no new GPS sample arrives.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sensor = await speedSourceFactory();
      const ctrl = new RunController({
        sensor,
        vehicleRepository,
        calibrationRepository,
        runRepository,
        sampleRepository,
        derivedCurveRepository,
        onStateChange: (s) => {
          if (cancelled) return;
          const prev = prevStateRef.current;
          if (s.kind === 'analyzing' && prev === 'running') {
            pulseStop();
          }
          prevStateRef.current = s.kind;
          setState(s);
          if (s.kind === 'reviewing') {
            navigate(`/runs/${s.run_id}/review`);
          }
          if (s.kind === 'aborted' && prev === 'analyzing') {
            navigate(`/vehicles/${vehicleId}`, { replace: true });
          }
        },
        onLiveSample: ({ t_ms, speed_mps, rpm, accuracy_m, quality, fix_rate_hz, altitude_m, heading_deg, recording }) => {
          if (cancelled) return;
          const sKmh = mpsToKmh(speed_mps);
          setCurrentSpeed(sKmh);
          setCurrentRpm(rpm);
          setGps({ accuracy_m, quality, fix_rate_hz, altitude_m, heading_deg });

          // Track sustained "good GPS" duration.
          if (accuracy_m != null && accuracy_m <= 10) {
            setGoodSince((prev) => prev ?? Date.now());
          } else {
            setGoodSince(null);
          }

          if (recording) {
            chartRef.current?.pushSample(t_ms, sKmh, rpm);

            const ring = ringRef.current;
            ring.push({ t_ms, speed_mps });
            if (ring.length > 5) ring.shift();
            if (ring.length >= 2 && massRef.current) {
              const first = ring[0];
              const last = ring[ring.length - 1];
              const dt = (last.t_ms - first.t_ms) / 1000;
              if (dt > 0) {
                const a = (last.speed_mps - first.speed_mps) / dt;
                const v = last.speed_mps;
                const p_w = Math.max(0, massRef.current * a * v);
                const p_kw = p_w / 1000;
                setLivePeakKw((prev) => (prev == null || p_kw > prev ? p_kw : prev));
              }
            }

            // Live 0-100: only meaningful if the recording started below ~5 km/h
            // (matches accel-times.ts ZERO_START_TOLERANCE_KMH). We freeze the
            // first crossing so the displayed time doesn't keep updating after
            // the milestone is hit.
            if (!startTimeRef.current) {
              startTimeRef.current = { t_ms, speed_mps };
            }
            if (!hundredCrossedRef.current && startTimeRef.current.speed_mps * 3.6 <= 5) {
              if (sKmh >= 100) {
                const elapsed = (t_ms - startTimeRef.current.t_ms) / 1000;
                hundredCrossedRef.current = true;
                setLiveZeroToHundred(elapsed);
              }
            }
          }
        },
        onRecordingFinished: (rec) => {
          setLastRecording(rec);
          recordingRepository.create({
            kind: rec.kind,
            vehicle_id: rec.meta.vehicle_id ?? null,
            calibration_id: rec.meta.calibration_id ?? null,
            run_id: rec.meta.run_id ?? null,
            gear_label: rec.meta.gear_label ?? null,
            user_rpm: rec.meta.user_rpm ?? null,
            label: rec.meta.label ?? null,
            recorded_at: rec.recorded_at,
            duration_ms: Math.round(rec.duration_ms),
            data: { gps_fixes: rec.gps_fixes, motion_fixes: rec.motion_fixes },
          }).catch((err) => {
            console.error('Failed to upload recording:', err);
          });
        },
        onError: (err) => {
          if (cancelled) return;
          console.error('RunController error:', err);
          const message = err instanceof Error ? err.message : 'Run failed';
          toast.show(`Run could not be analyzed: ${message}`, { variant: 'error' });
        },
      });
      ctrlRef.current = ctrl;
      await ctrl.warmup(vehicleId, calibrationId);
      if (cancelled) return;
      const vehicle = await vehicleRepository.get(vehicleId);
      if (!cancelled && vehicle) massRef.current = vehicle.mass_kg;
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.dispose();
      void wakeLockRef.current.release();
    };
  }, [vehicleId, calibrationId, speedSourceFactory, navigate, toast]);

  async function startRun() {
    if (!ctrlRef.current) return;
    const countdownEnabled = (() => {
      try { return localStorage.getItem('dynorun:countdown') === 'true'; } catch { return false; }
    })();
    if (countdownEnabled) {
      setCountingDown(true);
      return;
    }
    await beginRecording();
  }

  async function beginRecording() {
    if (!ctrlRef.current) return;
    setLivePeakKw(null);
    setLiveZeroToHundred(null);
    ringRef.current = [];
    startTimeRef.current = null;
    hundredCrossedRef.current = false;
    await wakeLockRef.current.acquire();
    chartRef.current?.reset();
    pulseStart();
    await ctrlRef.current.start();
  }

  async function stopRun() {
    if (!ctrlRef.current) return;
    pulseStop();
    await ctrlRef.current.stopNow();
  }

  const isRunning = state.kind === 'running';
  const isAnalyzing = state.kind === 'analyzing';
  const isReady = state.kind === 'ready';

  const gpsLocked = isGpsLocked(goodSince, now);
  const showPoorWarning = isReady && isGpsPoor(goodSince, warmupStartedAt, now);
  const canStart = isReady && (gpsLocked || forceStart);

  return (
    <div className="space-y-4 lg:max-w-3xl lg:mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100">Run</h1>

      {countingDown && (
        <CountdownOverlay
          from={3}
          onComplete={() => { setCountingDown(false); void beginRecording(); }}
          onCancel={() => setCountingDown(false)}
        />
      )}

      {isReady && (
        <GpsWarmupCard
          telemetry={gps}
          currentSpeedKmh={currentSpeed}
          warmupStartedAt={warmupStartedAt}
          goodSince={goodSince}
          now={now}
          poorOutcome="dyno data"
        />
      )}

      {isRunning && (
        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:space-y-0">
        <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">Recording</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Speed</p>
              <p className="tabular-nums">
                <span className="text-4xl font-bold text-zinc-100">{currentSpeed.toFixed(0)}</span>
                <span className="text-sm text-zinc-500 ml-1">km/h</span>
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">RPM</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-zinc-100">{currentRpm.toFixed(0)}</span>
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Live peak</p>
              <p className="tabular-nums">
                <span className="text-2xl font-bold text-amber-400">{format(livePeakKw)}</span>
              </p>
            </div>
          </div>
          {liveZeroToHundred != null && (
            <div className="mt-3 pt-3 border-t border-zinc-800 flex items-baseline justify-between">
              <span className="text-zinc-500 text-xs uppercase tracking-wider">0–100 km/h</span>
              <span className="tabular-nums">
                <span className="text-2xl font-bold text-amber-400">{liveZeroToHundred.toFixed(1)}</span>
                <span className="text-xs text-zinc-400 ml-1">s</span>
              </span>
            </div>
          )}
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
          <StreamingChart ref={chartRef} />
        </div>
        </div>
      )}

      {isReady && (
        <button
          onClick={startRun}
          disabled={!canStart}
          className={`w-full font-bold py-4 rounded-xl transition-colors text-lg ${
            canStart
              ? showPoorWarning
                ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white'
                : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {showPoorWarning && forceStart ? 'Start anyway' : 'Start run'}
        </button>
      )}
      {isReady && (
        <p className="text-center text-xs text-zinc-500">
          On the bike?{' '}
          <a
            href={`/vehicles/${vehicleId}/calibrations/${calibrationId}/session`}
            className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            Use the hands-free session mode
          </a>{' '}
          — record the whole ride, pick your pull afterwards.
        </p>
      )}
      {isReady && showPoorWarning && !forceStart && (
        <button
          onClick={() => setForceStart(true)}
          className="w-full text-zinc-500 hover:text-zinc-300 text-xs underline underline-offset-2"
        >
          Start anyway (data will be unreliable)
        </button>
      )}
      {isRunning && (
        <button
          onClick={stopRun}
          className="w-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold py-4 rounded-xl transition-colors text-lg"
        >
          Stop
        </button>
      )}
      {isAnalyzing && (
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-amber-400 font-medium">Analyzing run…</p>
        </div>
      )}
      {(state.kind === 'idle') && (
        <div className="flex items-center justify-center py-4">
          <p className="text-zinc-500 text-sm">Initializing sensors…</p>
        </div>
      )}
    </div>
  );
}
