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

export function LiveRunScreen() {
  const { vehicleId = '', calibrationId = '' } = useParams();
  const speedSourceFactory = useSpeedSourceFactory();
  const navigate = useNavigate();
  const [state, setState] = useState<RunState>({ kind: 'idle' });
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentRpm, setCurrentRpm] = useState(0);
  const ctrlRef = useRef<RunController | null>(null);
  const chartRef = useRef<StreamingChartHandle>(null);
  const wakeLockRef = useRef(new WakeLock());

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
        onLiveSample: ({ t_ms, speed_mps, rpm }) => {
          if (cancelled) return;
          const sKmh = mpsToKmh(speed_mps);
          setCurrentSpeed(sKmh);
          setCurrentRpm(rpm);
          chartRef.current?.pushSample(t_ms, sKmh, rpm);
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
      await ctrl.ready(vehicleId, calibrationId);
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.stopNow();
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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-zinc-100">Run</h1>

      {/* Live data panel */}
      <div className={`bg-zinc-900 border rounded-2xl p-5 transition-colors ${
        isRunning ? 'border-amber-700/60' : 'border-zinc-800'
      }`}>
        {isRunning && (
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">Recording</span>
          </div>
        )}
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

      {/* Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
        <StreamingChart ref={chartRef} />
      </div>

      {/* Controls */}
      {isReady && (
        <button
          onClick={startRun}
          className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-bold py-4 rounded-xl transition-colors text-lg"
        >
          Start run
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
