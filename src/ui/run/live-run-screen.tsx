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
import { Na, Plate, PlateButton, PlateLink, ProfileView, Readout, TitleBlock, Zone } from '@/ui/plate';

interface GpsState {
  accuracy_m: number | null;
  quality: number;
  fix_rate_hz: number;
  altitude_m: number | null;
  heading_deg: number | null;
}

// See ACCENT_INK_3 in run-review-screen.tsx: `.plane-ink` cannot reach the
// inline ink-3 on Readout's unit, so the property is overridden here.
const ACCENT_INK_3 = '[--color-ink-3:color-mix(in_srgb,var(--color-sheet)_68%,transparent)]';

const STATE_LABEL: Record<RunState['kind'], string> = {
  idle: 'Starting sensors',
  ready: 'Armed',
  running: 'Recording',
  analyzing: 'Analyzing',
  reviewing: 'Reviewing',
  saved: 'Saved',
  aborted: 'Aborted',
};

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
  const [vehicleName, setVehicleName] = useState<string | null>(null);
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
      if (!cancelled && vehicle) {
        massRef.current = vehicle.mass_kg;
        setVehicleName(vehicle.name);
      }
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
    <Plate className="lg:max-w-3xl lg:mx-auto">
      <TitleBlock
        ident={vehicleName ?? undefined}
        title="Run"
        meta={[
          { label: 'Capture', value: 'Interactive, watch the screen' },
          { label: 'State', value: STATE_LABEL[state.kind] },
        ]}
      />

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
        <>
          {/* The one earned accent plane on this screen: while the car is
              moving, the live speed IS the sheet. Trackside, so the readout
              keeps its size even though the review screens tightened. */}
          <Zone label="Live readout" note="Recording" accent flush className={ACCENT_INK_3}>
            <div className="grid grid-cols-2">
              <div className="px-3 py-4">
                <Readout label="Speed" value={currentSpeed.toFixed(0)} unit="km/h" size="xl" />
              </div>
              <div className="rule-l px-3 py-4">
                <Readout label="RPM" value={currentRpm.toFixed(0)} />
              </div>
            </div>
            <dl className="rule-t grid grid-cols-2">
              <div className="px-3 py-2.5">
                <dt className="t-annotation">Live peak</dt>
                <dd className="t-data mt-1 text-lg">
                  {livePeakKw == null ? <Na title="No positive drive power measured yet" /> : format(livePeakKw)}
                </dd>
              </div>
              <div className="rule-l px-3 py-2.5">
                <dt className="t-annotation">0-100 km/h</dt>
                <dd className="t-data mt-1 text-lg">
                  {liveZeroToHundred == null ? (
                    <Na title="Only measured when the pull started from a stop" />
                  ) : (
                    <>
                      {liveZeroToHundred.toFixed(1)}
                      <span className="t-annotation ml-1">s</span>
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </Zone>

          <ProfileView label="Speed and RPM" axis="last 30 s">
            <div className="p-1.5">
              <StreamingChart ref={chartRef} />
            </div>
          </ProfileView>

          <PlateButton variant="procedure" major onClick={stopRun}>
            Stop
          </PlateButton>
        </>
      )}

      {isReady && (
        <div className="space-y-3">
          <PlateButton variant="procedure" major onClick={startRun} disabled={!canStart}>
            {showPoorWarning && forceStart ? 'Start anyway' : 'Start run'}
          </PlateButton>
          {showPoorWarning && !forceStart && (
            <PlateButton className="w-full" onClick={() => setForceStart(true)}>
              Start anyway, data will be unreliable
            </PlateButton>
          )}
          <p className="t-body text-center text-[0.8125rem] leading-6">
            On the bike? Use the hands-free session mode to record the whole ride and pick your pull
            afterwards.
          </p>
          <div className="flex justify-center">
            <PlateLink to={`/vehicles/${vehicleId}/calibrations/${calibrationId}/session`}>
              Hands-free session
            </PlateLink>
          </div>
        </div>
      )}

      {isAnalyzing && (
        <p className="t-label py-6 text-center">Analyzing run</p>
      )}

      {state.kind === 'idle' && (
        <p className="t-annotation py-6 text-center">Initializing sensors</p>
      )}
    </Plate>
  );
}
