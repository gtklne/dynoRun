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

const ACCURACY_GOOD_M = 10;
const REQUIRED_GOOD_MS = 2_000;
const POOR_WARN_MS = 15_000;

function accuracyColor(m: number | null): string {
  if (m === null) return 'text-zinc-500';
  if (m <= ACCURACY_GOOD_M) return 'text-emerald-400';
  if (m <= 20) return 'text-amber-400';
  return 'text-red-400';
}

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
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentRpm, setCurrentRpm] = useState(0);
  const [gps, setGps] = useState<GpsState | null>(null);
  const [warmupStartedAt] = useState<number>(() => Date.now());
  const [goodSince, setGoodSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [forceStart, setForceStart] = useState(false);
  const ctrlRef = useRef<RunController | null>(null);
  const chartRef = useRef<StreamingChartHandle>(null);
  const wakeLockRef = useRef(new WakeLock());

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
          setState(s);
          if (s.kind === 'reviewing') {
            navigate(`/runs/${s.run_id}/review`);
          }
        },
        onLiveSample: ({ t_ms, speed_mps, rpm, accuracy_m, quality, fix_rate_hz, altitude_m, heading_deg, recording }) => {
          if (cancelled) return;
          const sKmh = mpsToKmh(speed_mps);
          setCurrentSpeed(sKmh);
          setCurrentRpm(rpm);
          setGps({ accuracy_m, quality, fix_rate_hz, altitude_m, heading_deg });

          // Track sustained "good GPS" duration.
          if (accuracy_m != null && accuracy_m <= ACCURACY_GOOD_M) {
            setGoodSince((prev) => prev ?? Date.now());
          } else {
            setGoodSince(null);
          }

          if (recording) chartRef.current?.pushSample(t_ms, sKmh, rpm);
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
      });
      ctrlRef.current = ctrl;
      await ctrl.warmup(vehicleId, calibrationId);
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.dispose();
      void wakeLockRef.current.release();
    };
  }, [vehicleId, calibrationId, speedSourceFactory, navigate]);

  async function startRun() {
    if (!ctrlRef.current) return;
    await wakeLockRef.current.acquire();
    chartRef.current?.reset();
    await ctrlRef.current.start();
  }

  async function stopRun() {
    if (!ctrlRef.current) return;
    await ctrlRef.current.stopNow();
  }

  const isRunning = state.kind === 'running';
  const isAnalyzing = state.kind === 'analyzing';
  const isReady = state.kind === 'ready';
  const isWarmingUp = isReady && gps === null;

  const goodFor_ms = goodSince != null ? now - goodSince : 0;
  const warmupFor_ms = now - warmupStartedAt;
  const gpsLocked = goodFor_ms >= REQUIRED_GOOD_MS;
  const showPoorWarning = isReady && !gpsLocked && warmupFor_ms > POOR_WARN_MS;
  const canStart = isReady && (gpsLocked || forceStart);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Run</h1>

      {/* Warmup card — shown only before recording starts */}
      {isReady && (
        <div className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors ${
          gpsLocked ? 'border-emerald-800/40' : showPoorWarning ? 'border-red-800/50' : 'border-zinc-800'
        }`}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/60">
            <div className={`w-1.5 h-1.5 rounded-full ${
              gpsLocked ? 'bg-emerald-400' : showPoorWarning ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
            }`} />
            <span className={`text-xs font-semibold uppercase tracking-widest ${
              gpsLocked ? 'text-emerald-400' : showPoorWarning ? 'text-red-400' : 'text-amber-400'
            }`}>
              {isWarmingUp ? 'Waiting for first fix' : gpsLocked ? 'GPS locked' : showPoorWarning ? 'Poor GPS conditions' : 'Acquiring GPS lock'}
            </span>
          </div>

          {showPoorWarning && (
            <div className="px-4 py-3 bg-red-950/30 border-b border-red-800/40">
              <p className="text-red-300 text-xs leading-relaxed">
                Accuracy has stayed worse than {ACCURACY_GOOD_M} m for over {Math.floor(POOR_WARN_MS / 1000)}s.
                Moving to open sky usually helps. Starting now will produce unreliable dyno data.
              </p>
            </div>
          )}

          {/* Live GPS telemetry */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-baseline justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Accuracy</span>
              <span className={`tabular-nums text-sm font-mono font-semibold ${accuracyColor(gps?.accuracy_m ?? null)}`}>
                {gps?.accuracy_m != null ? gps.accuracy_m.toFixed(1) : '—'}
                <span className="text-zinc-500 text-xs font-normal ml-1">m</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Signal Quality</span>
              <span className="tabular-nums text-sm font-mono font-semibold text-zinc-100">
                {gps ? Math.round(gps.quality * 100) : '—'}
                <span className="text-zinc-500 text-xs font-normal ml-1">%</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between py-1 border-b border-zinc-800/60">
              <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Fix Rate</span>
              <span className="tabular-nums text-sm font-mono font-semibold text-zinc-100">
                {gps?.fix_rate_hz != null ? gps.fix_rate_hz.toFixed(1) : '—'}
                <span className="text-zinc-500 text-xs font-normal ml-1">Hz</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between py-1">
              <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Current Speed</span>
              <span className="tabular-nums text-sm font-mono font-semibold text-zinc-100">
                {currentSpeed.toFixed(1)}
                <span className="text-zinc-500 text-xs font-normal ml-1">km/h</span>
              </span>
            </div>
          </div>

          {/* Lock progress bar */}
          {!gpsLocked && (
            <div className="px-4 pb-3 pt-1">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-zinc-600 text-[11px] uppercase tracking-wider">Lock progress</span>
                <span className="text-zinc-500 text-[11px] font-mono tabular-nums">
                  {(goodFor_ms / 1000).toFixed(1)}s / {(REQUIRED_GOOD_MS / 1000).toFixed(0)}s
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    goodSince ? 'bg-emerald-500' : showPoorWarning ? 'bg-red-600' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, (goodFor_ms / REQUIRED_GOOD_MS) * 100)}%` }}
                />
              </div>
              <p className="text-zinc-600 text-[11px] mt-1.5">
                Need {(REQUIRED_GOOD_MS / 1000).toFixed(0)}s of accuracy ≤ {ACCURACY_GOOD_M} m
              </p>
            </div>
          )}
        </div>
      )}

      {/* Live recording panel */}
      {isRunning && (
        <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">Recording</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Speed</p>
              <p className="tabular-nums">
                <span className="text-5xl font-bold text-zinc-100">{currentSpeed.toFixed(0)}</span>
                <span className="text-lg text-zinc-500 ml-1.5">km/h</span>
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">RPM</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-zinc-100">{currentRpm.toFixed(0)}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart — only meaningful when actually recording */}
      {isRunning && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
          <StreamingChart ref={chartRef} />
        </div>
      )}

      {/* Controls */}
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
