import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { RunController } from '@/run/run-controller';
import { WakeLock } from '@/app/wake-lock';
import { useSpeedSourceFactory } from '@/ui/calibration/speed-source-context';
import { StreamingChart, type StreamingChartHandle } from '@/ui/components/streaming-chart';
import { mpsToKmh } from '@/shared/units';
import type { RunState } from '@/run/types';

export function LiveRunScreen() {
  const { vehicleId = '', calibrationId = '' } = useParams();
  const db = useDatabase();
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
      const sensor = speedSourceFactory();
      const ctrl = new RunController({
        sensor,
        vehicleRepository: new VehicleRepository(db),
        calibrationRepository: new CalibrationRepository(db),
        runRepository: new RunRepository(db),
        sampleRepository: new SampleRepository(db),
        derivedCurveRepository: new DerivedCurveRepository(db),
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
      });
      ctrlRef.current = ctrl;
      await ctrl.ready(vehicleId, calibrationId);
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.stopNow();
      void wakeLockRef.current.release();
    };
  }, [db, vehicleId, calibrationId, speedSourceFactory, navigate]);

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

  return (
    <section>
      <h1>Run</h1>
      <p style={{ fontSize: 48, margin: 0 }}>
        <strong>{currentSpeed.toFixed(0)}</strong> km/h
      </p>
      <p style={{ fontSize: 24, margin: 0 }}>{currentRpm.toFixed(0)} RPM</p>
      <StreamingChart ref={chartRef} />
      {state.kind === 'ready' && <button onClick={startRun}>Start run</button>}
      {state.kind === 'running' && <button onClick={stopRun}>Stop</button>}
      {state.kind === 'analyzing' && <p>Analyzing…</p>}
    </section>
  );
}
