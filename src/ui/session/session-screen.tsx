import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { runRepository } from '@/api/repositories/run-repository';
import { sampleRepository } from '@/api/repositories/sample-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { recordingRepository } from '@/api/repositories/recording-repository';
import { SessionController } from '@/run/session-controller';
import type { SessionState, SessionPull } from '@/run/types';
import { WakeLock } from '@/app/wake-lock';
import { speak } from '@/app/speech';
import { pulseStart, pulseStop } from '@/app/haptics';
import { useSpeedSourceFactory } from '@/ui/calibration/speed-source-context';
import { GpsWarmupCard, isGpsLocked, isGpsPoor } from '@/ui/components/gps-warmup-card';
import { setLastRecording } from '@/sensors/replay-state';
import { mpsToKmh } from '@/shared/units';
import { useUnits } from '@/app/units-context';
import { useToast } from '@/ui/components/toast';
import { HoldToFinishButton } from './hold-to-finish-button';
import { PullSparkline } from './pull-sparkline';

interface GpsState {
  accuracy_m: number | null;
  quality: number;
  fix_rate_hz: number;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function peakPowerKw(p: SessionPull): number {
  if (!p.analysis || p.analysis.points.length === 0) return 0;
  return Math.max(...p.analysis.points.map((pt) => pt.wheel_power_kw));
}

export function SessionScreen() {
  const { vehicleId = '', calibrationId = '' } = useParams();
  const speedSourceFactory = useSpeedSourceFactory();
  const navigate = useNavigate();
  const { format } = useUnits();
  const toast = useToast();
  const [state, setState] = useState<SessionState>({ kind: 'idle' });
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentRpm, setCurrentRpm] = useState(0);
  const [gps, setGps] = useState<GpsState | null>(null);
  const [warmupStartedAt] = useState<number>(() => Date.now());
  const [goodSince, setGoodSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [forceStart, setForceStart] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const ctrlRef = useRef<SessionController | null>(null);
  const wakeLockRef = useRef(new WakeLock());
  const startedWallRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sensor = await speedSourceFactory();
      const ctrl = new SessionController({
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
            void wakeLockRef.current.release();
            // Pre-select the strongest pull — usually the run the rider made.
            const best = s.pulls.reduce<{ i: number; kw: number } | null>((acc, p, i) => {
              if (!p.analysis) return acc;
              const kw = peakPowerKw(p);
              return !acc || kw > acc.kw ? { i, kw } : acc;
            }, null);
            setSelected(best ? new Set([best.i]) : new Set());
            speak(
              s.pulls.length === 0
                ? 'Session finished. No pulls detected.'
                : `Session finished. ${s.pulls.length} ${s.pulls.length === 1 ? 'pull' : 'pulls'} detected.`,
            );
          }
          if (s.kind === 'saved') {
            toast.show(
              s.run_ids.length === 1 ? 'Run saved' : `${s.run_ids.length} runs saved`,
              { variant: 'success' },
            );
            if (s.run_ids.length === 1) {
              navigate(`/runs/${s.run_ids[0]}/review`);
            } else {
              navigate(`/vehicles/${s.vehicle_id}`);
            }
          }
        },
        onLiveSample: ({ speed_mps, rpm, accuracy_m, quality, fix_rate_hz }) => {
          if (cancelled) return;
          setCurrentSpeed(mpsToKmh(speed_mps));
          setCurrentRpm(rpm);
          setGps({ accuracy_m, quality, fix_rate_hz });
          if (accuracy_m != null && accuracy_m <= 10) {
            setGoodSince((prev) => prev ?? Date.now());
          } else {
            setGoodSince(null);
          }
        },
        onRecordingFinished: (rec) => {
          setLastRecording(rec);
          recordingRepository.create({
            kind: rec.kind,
            vehicle_id: rec.meta.vehicle_id ?? null,
            calibration_id: rec.meta.calibration_id ?? null,
            run_id: null,
            gear_label: rec.meta.gear_label ?? null,
            user_rpm: null,
            label: rec.meta.label ?? null,
            recorded_at: rec.recorded_at,
            duration_ms: Math.round(rec.duration_ms),
            data: { gps_fixes: rec.gps_fixes, motion_fixes: rec.motion_fixes },
          }).catch((err) => {
            console.error('Failed to upload session recording:', err);
          });
        },
        onError: (err) => {
          if (cancelled) return;
          console.error('SessionController error:', err);
          const message = err instanceof Error ? err.message : 'Session failed';
          toast.show(`Session error: ${message}`, { variant: 'error' });
        },
      });
      ctrlRef.current = ctrl;
      try {
        await ctrl.warmup(vehicleId, calibrationId);
      } catch (err) {
        if (!cancelled) {
          console.error('Session warmup failed:', err);
          toast.show('Could not start sensors for this session', { variant: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.dispose();
      void wakeLockRef.current.release();
    };
  }, [vehicleId, calibrationId, speedSourceFactory, navigate, toast]);

  async function startSession() {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    // Best-effort: a denied wake lock (permission policy, battery saver) must
    // not block the session — the rider just has to keep the screen on.
    try { await wakeLockRef.current.acquire(); } catch (err) { console.warn('Wake lock unavailable:', err); }
    startedWallRef.current = Date.now();
    pulseStart();
    speak('Recording started. Put the phone away and ride when ready.');
    ctrl.start();
  }

  function finishSession() {
    pulseStop();
    speak('Recording stopped. Analyzing.');
    void ctrlRef.current?.finish();
  }

  async function saveSelected() {
    const ctrl = ctrlRef.current;
    if (!ctrl || selected.size === 0) return;
    await ctrl.saveSelected([...selected]);
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const isReady = state.kind === 'ready';
  const isRecording = state.kind === 'recording';
  const isDetecting = state.kind === 'detecting';
  const isReviewing = state.kind === 'reviewing';
  const isSaving = state.kind === 'saving';
  const pulls = state.kind === 'reviewing' || state.kind === 'saving' ? state.pulls : [];
  const gearLabel = state.kind !== 'idle' && state.kind !== 'saved' ? state.gear_label : '';

  const gpsLocked = isGpsLocked(goodSince, now);
  const showPoorWarning = isReady && isGpsPoor(goodSince, warmupStartedAt, now);
  const canStart = isReady && (gpsLocked || forceStart);
  const elapsed = startedWallRef.current != null ? now - startedWallRef.current : 0;

  const bestIndex = useMemo(() => {
    let best = -1;
    let bestKw = -1;
    pulls.forEach((p, i) => {
      if (!p.analysis) return;
      const kw = peakPowerKw(p);
      if (kw > bestKw) { bestKw = kw; best = i; }
    });
    return best;
  }, [pulls]);

  return (
    <div className="space-y-4 lg:max-w-3xl lg:mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100">Hands-free session</h1>

      {isReady && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest">How it works</p>
            <ol className="text-zinc-400 text-sm space-y-1.5 list-decimal list-inside">
              <li>Start the session here while stopped, then put the phone away.</li>
              <li>Ride normally — shift up into <span className="text-zinc-200 font-medium">{gearLabel}</span>, settle briefly, then make your full pull.</li>
              <li>Ride back, stop, and hold the finish button. Your pulls are detected automatically.</li>
            </ol>
            <p className="text-zinc-600 text-xs pt-1">
              Keep the screen on (it stays awake by itself). You can make several pulls in one session.
            </p>
          </div>

          <GpsWarmupCard
            telemetry={gps}
            currentSpeedKmh={currentSpeed}
            warmupStartedAt={warmupStartedAt}
            goodSince={goodSince}
            now={now}
            poorOutcome="dyno data"
          />

          <button
            onClick={startSession}
            disabled={!canStart}
            className={`w-full font-bold py-5 rounded-xl transition-colors text-lg ${
              canStart
                ? showPoorWarning
                  ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            {showPoorWarning && forceStart ? 'Start session anyway' : 'Start session'}
          </button>
          {showPoorWarning && !forceStart && (
            <button
              onClick={() => setForceStart(true)}
              className="w-full text-zinc-500 hover:text-zinc-300 text-xs underline underline-offset-2"
            >
              Start anyway (data will be unreliable)
            </button>
          )}
        </>
      )}

      {isRecording && (
        <>
          <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">Recording session</span>
              <span className="ml-auto tabular-nums text-zinc-100 text-xl font-bold">{formatElapsed(elapsed)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Speed</p>
                <p className="tabular-nums">
                  <span className="text-5xl font-bold text-zinc-100">{currentSpeed.toFixed(0)}</span>
                  <span className="text-sm text-zinc-500 ml-1">km/h</span>
                </p>
              </div>
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">RPM</p>
                <p className="tabular-nums">
                  <span className="text-4xl font-bold text-zinc-100">{currentRpm.toFixed(0)}</span>
                </p>
              </div>
            </div>
            <p className="text-zinc-500 text-sm mt-4">
              Put the phone away and ride. Everything is recorded — your pulls are picked out afterwards.
            </p>
          </div>
          <HoldToFinishButton onFinish={finishSession} label="Hold to finish session" />
          <p className="text-zinc-600 text-xs text-center">
            Hold for 1.5 s — stray pocket touches won't stop the session.
          </p>
        </>
      )}

      {isDetecting && (
        <div className="flex items-center justify-center gap-3 py-10">
          <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-amber-400 font-medium">Analyzing session…</p>
        </div>
      )}

      {(isReviewing || isSaving) && pulls.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <p className="text-zinc-100 font-semibold">No pulls detected</p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            The session didn't contain a clear acceleration run (at least ~15 km/h of sustained
            speed gain). The raw recording was still saved — you can inspect it in the Replay Lab.
          </p>
          <div className="flex gap-2">
            <Link
              to={`/vehicles/${vehicleId}`}
              className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm py-3 rounded-xl transition-colors"
            >
              Back to vehicle
            </Link>
            <Link
              to="/replay"
              className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm py-3 rounded-xl transition-colors"
            >
              Replay Lab
            </Link>
          </div>
        </div>
      )}

      {(isReviewing || isSaving) && pulls.length > 0 && (
        <>
          <p className="text-zinc-400 text-sm">
            {pulls.length === 1 ? 'One pull detected.' : `${pulls.length} pulls detected.`} Select
            the ones to keep as runs — the rest are discarded (the raw session recording stays available for replay).
          </p>

          <div className="space-y-2">
            {pulls.map((p, i) => {
              const analyzable = p.analysis != null;
              const checked = selected.has(i);
              const kw = peakPowerKw(p);
              return (
                <button
                  key={i}
                  onClick={() => analyzable && toggle(i)}
                  disabled={!analyzable}
                  className={`w-full text-left bg-zinc-900 border rounded-2xl p-4 transition-colors ${
                    checked ? 'border-amber-500' : 'border-zinc-800'
                  } ${analyzable ? 'hover:border-amber-700' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        checked ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'
                      }`}
                    >
                      {checked && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <p className="text-zinc-100 font-semibold text-sm">Pull {i + 1}</p>
                    {i === bestIndex && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                        Best
                      </span>
                    )}
                    <span className="ml-auto tabular-nums text-amber-400 font-bold text-sm">
                      {analyzable ? format(kw) : '—'}
                    </span>
                  </div>
                  <PullSparkline samples={p.samples} />
                  <div className="flex items-baseline justify-between mt-2 text-xs text-zinc-500 tabular-nums">
                    <span>
                      {mpsToKmh(p.pull.v_start_mps).toFixed(0)} → {mpsToKmh(p.pull.v_peak_mps).toFixed(0)} km/h
                    </span>
                    <span>{(p.pull.duration_ms / 1000).toFixed(1)} s</span>
                    {analyzable ? (
                      <span>
                        {p.analysis!.rpm_min.toFixed(0)}–{p.analysis!.rpm_max.toFixed(0)} RPM
                      </span>
                    ) : (
                      <span className="text-red-400">couldn't analyze</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={saveSelected}
            disabled={selected.size === 0 || isSaving}
            className={`w-full font-bold py-4 rounded-xl transition-colors text-lg ${
              selected.size > 0 && !isSaving
                ? 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            {isSaving
              ? 'Saving…'
              : selected.size <= 1
                ? 'Save as run'
                : `Save ${selected.size} runs`}
          </button>
          <Link
            to={`/vehicles/${vehicleId}`}
            className="block w-full text-center text-zinc-500 hover:text-zinc-300 text-sm py-2 transition-colors"
          >
            Discard all
          </Link>
        </>
      )}

      {state.kind === 'idle' && (
        <div className="flex items-center justify-center py-4">
          <p className="text-zinc-500 text-sm">Initializing sensors…</p>
        </div>
      )}
    </div>
  );
}
