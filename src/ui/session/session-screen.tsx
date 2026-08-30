import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { runRepository } from '@/api/repositories/run-repository';
import { sampleRepository } from '@/api/repositories/sample-repository';
import { derivedCurveRepository } from '@/api/repositories/derived-curve-repository';
import { recordingRepository } from '@/api/repositories/recording-repository';
import { SessionController } from '@/run/session-controller';
import type { SessionState, SessionPull } from '@/run/types';
import type { StandstillProgress } from '@/run/standstill-detector';
import { WakeLock } from '@/app/wake-lock';
import { speak } from '@/app/speech';
import { pulseStart, pulseStop } from '@/app/haptics';
import { useSpeedSourceFactory } from '@/ui/calibration/speed-source-context';
import { GpsWarmupCard, isGpsLocked, isGpsPoor } from '@/ui/components/gps-warmup-card';
import { setLastRecording } from '@/sensors/replay-state';
import { mpsToKmh } from '@/shared/units';
import { useUnits } from '@/app/units-context';
import { useToast } from '@/ui/components/toast';
import {
  Advisory,
  Na,
  NotesBox,
  Plate,
  PlateButton,
  PlateLink,
  Readout,
  TitleBlock,
  Zone,
} from '@/ui/plate';
import { HoldToFinishButton } from './hold-to-finish-button';
import { PullSparkline } from './pull-sparkline';
import { assessSignal, type SignalIntegrity } from '@/analysis/signal-integrity';

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

/**
 * A marginal label on a row: ruled, never a filled pill. `mark` is identity
 * (this is the strongest pull) and stays in plain ink; `stop` is judgement
 * (the receiver, not the bike, made this number) and takes the traffic light.
 */
function RowMark({ children, tone }: { children: string; tone: 'mark' | 'stop' }) {
  const color = tone === 'mark' ? 'var(--color-ink)' : 'var(--color-stop)';
  return (
    <span
      className="t-annotation shrink-0 px-1.5 py-0.5"
      style={{ border: 'var(--rule-hair) solid ' + color, color }}
    >
      {children}
    </span>
  );
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
  const [standstill, setStandstill] = useState<StandstillProgress | null>(null);
  const [sensorWarning, setSensorWarning] = useState<string | null>(null);
  const ctrlRef = useRef<SessionController | null>(null);
  const wakeLockRef = useRef(new WakeLock());
  const startedWallRef = useRef<number | null>(null);
  // Latched per standstill: onStandstillProgress fires on every GPS fix, so an
  // unlatched speak() would talk over itself about once a second.
  const countdownSpokenRef = useRef(false);

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
            // Pre-select the strongest pull: usually the run the rider made.
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
        onStandstillProgress: (p) => {
          if (cancelled) return;
          setStandstill(p);
          if (p.armed && p.stopped) {
            if (!countdownSpokenRef.current) {
              countdownSpokenRef.current = true;
              speak(`Stopped. Finishing in ${Math.round(p.remaining_ms / 1000)} seconds unless you ride on.`);
            }
          } else if (!p.stopped) {
            // Moving again, so a later stop in the same session announces afresh.
            countdownSpokenRef.current = false;
          }
        },
        onSensorWarning: (message) => {
          if (cancelled) return;
          // Deliberately not a toast: the phone is in a pocket while this
          // fires, so the message has to still be there when it comes out.
          setSensorWarning(message);
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
    // not block the session: the rider just has to keep the screen on.
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

  const integrity = useMemo<Array<SignalIntegrity | null>>(
    () => pulls.map((p) => (p.samples.length > 1 ? assessSignal(p.samples) : null)),
    [pulls],
  );

  const corruptSelected = useMemo(
    () => [...selected].filter((i) => integrity[i]?.verdict === 'corrupt').length,
    [selected, integrity],
  );

  const bestIndex = useMemo(() => {
    let best = -1;
    let bestKw = -1;
    pulls.forEach((p, i) => {
      if (!p.analysis) return;
      // A corrupt pull is usually the highest number in the session, because
      // the artifact that broke it inflates power. Letting it wear the "Best"
      // badge would point the rider straight at the one pull to throw away.
      if (integrity[i]?.verdict === 'corrupt') return;
      const kw = peakPowerKw(p);
      if (kw > bestKw) { bestKw = kw; best = i; }
    });
    return best;
  }, [pulls, integrity]);

  return (
    <Plate className="lg:mx-auto lg:max-w-3xl">
      <TitleBlock
        ident={gearLabel ? `Gear ${gearLabel}` : undefined}
        title="Hands-free session"
        meta={[
          { label: 'Capture', value: 'Whole ride, nothing chosen while moving' },
          { label: 'Ends', value: '20 s stopped, or hold to finish' },
        ]}
      />

      {sensorWarning && (isRecording || isDetecting || isReviewing || isSaving) && (
        <Advisory>{sensorWarning}</Advisory>
      )}

      {isReady && (
        <>
          <Zone label="How it works" flush>
            <ol>
              <li className="flex items-start gap-3 px-3 py-2">
                <span
                  aria-hidden="true"
                  className="t-data flex h-6 w-6 shrink-0 items-center justify-center text-xs"
                  style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)' }}
                >
                  1
                </span>
                <span className="t-body text-[0.875rem] leading-6">
                  Start the session here while stopped, then put the phone away.
                </span>
              </li>
              <li className="rule-t flex items-start gap-3 px-3 py-2">
                <span
                  aria-hidden="true"
                  className="t-data flex h-6 w-6 shrink-0 items-center justify-center text-xs"
                  style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)' }}
                >
                  2
                </span>
                <span className="t-body text-[0.875rem] leading-6">
                  Ride normally: shift up into <span className="t-data">{gearLabel}</span>, settle
                  briefly, then make your full pull.
                </span>
              </li>
              <li className="rule-t flex items-start gap-3 px-3 py-2">
                <span
                  aria-hidden="true"
                  className="t-data flex h-6 w-6 shrink-0 items-center justify-center text-xs"
                  style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)' }}
                >
                  3
                </span>
                <span className="t-body text-[0.875rem] leading-6">
                  Ride back and stop: the session finishes itself a short while later, or hold the
                  finish button to finish now. Your pulls are detected automatically.
                </span>
              </li>
            </ol>
          </Zone>

          <NotesBox title="While you ride">
            Keep the screen on (it stays awake by itself). You can make several pulls in one
            session, and nothing is committed until you pick the ones you meant.
          </NotesBox>

          <GpsWarmupCard
            telemetry={gps}
            currentSpeedKmh={currentSpeed}
            warmupStartedAt={warmupStartedAt}
            goodSince={goodSince}
            now={now}
            poorOutcome="dyno data"
          />

          <div className="space-y-3">
            <PlateButton variant="procedure" major onClick={startSession} disabled={!canStart}>
              {showPoorWarning && forceStart ? 'Start session anyway' : 'Start session'}
            </PlateButton>
            {showPoorWarning && !forceStart && (
              <button
                type="button"
                onClick={() => setForceStart(true)}
                className="t-annotation w-full py-2 underline underline-offset-4"
              >
                Start anyway (data will be unreliable)
              </button>
            )}
          </div>
        </>
      )}

      {isRecording && (
        <>
          {/* The one earned accent plane here: while the bike is moving the
              live speed is the whole sheet. Trackside, so it stays large. */}
          <Zone
            label="Recording session"
            note={`Elapsed ${formatElapsed(elapsed)}`}
            accent
            flush
           
          >
            <div className="rule-b grid grid-cols-2">
              <div className="px-3 py-4">
                <Readout label="Speed" value={currentSpeed.toFixed(0)} unit="km/h" size="xl" />
              </div>
              <div className="rule-l px-3 py-4">
                <Readout label="RPM" value={currentRpm.toFixed(0)} />
              </div>
            </div>
            {/* Annotation, not body: `.plane-ink` remaps the annotation and
                label registers onto the inverted ground and leaves body copy
                in its sheet-plate ink, which would be unreadable here. */}
            <p className="t-annotation px-3 py-2 normal-case tracking-normal">
              Put the phone away and ride. Everything is recorded, and your pulls are picked out
              afterwards.
            </p>
          </Zone>

          {standstill?.armed && standstill.stopped && (
            <Advisory>
              You have stopped, so the session ends by itself in{' '}
              {Math.ceil(standstill.remaining_ms / 1000)} s and starts picking out your pulls.
              Riding on cancels the countdown.
            </Advisory>
          )}

          <div className="space-y-2">
            <HoldToFinishButton onFinish={finishSession} label="Hold to finish session" />
            <p className="t-annotation text-center">
              Hold for 1.5 s, so stray pocket touches will not stop the session.
            </p>
          </div>
        </>
      )}

      {isDetecting && <p className="t-label py-10 text-center">Analyzing session...</p>}

      {(isReviewing || isSaving) && pulls.length === 0 && (
        <>
          <Zone label="No pulls detected">
            <p className="t-body text-[0.875rem] leading-6">
              The session did not contain a clear acceleration run (at least about 15 km/h of
              sustained speed gain). The raw recording was still saved, so you can inspect it in
              the Replay Lab.
            </p>
          </Zone>
          <div className="grid grid-cols-2 gap-2.5">
            <PlateLink to={`/vehicles/${vehicleId}`} className="w-full">
              Back to vehicle
            </PlateLink>
            <PlateLink to="/replay" className="w-full">
              Replay Lab
            </PlateLink>
          </div>
        </>
      )}

      {(isReviewing || isSaving) && pulls.length > 0 && (
        <>
          <Zone
            label="Detected pulls"
            note={`${pulls.length === 1 ? 'One pull' : `${pulls.length} pulls`}, ${selected.size} selected`}
            flush
          >
            <p className="rule-b t-body px-3 py-2 text-[0.8125rem] leading-6">
              Select the ones to keep as runs. The rest are discarded, and the raw session
              recording stays available for replay.
            </p>

            {pulls.map((p, i) => {
              const analyzable = p.analysis != null;
              const checked = selected.has(i);
              const kw = peakPowerKw(p);
              const corrupt = integrity[i]?.verdict === 'corrupt';
              return (
                <label
                  key={i}
                  className={`block px-3 py-2.5 ${i > 0 ? 'rule-t' : ''} ${analyzable ? 'cursor-pointer' : ''}`}
                  style={checked ? { background: 'var(--color-plane-2)' } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={checked}
                      disabled={!analyzable}
                      onChange={() => toggle(i)}
                      aria-label={`Keep pull ${i + 1}`}
                    />
                    <span className="t-data text-sm">Pull {i + 1}</span>
                    {corrupt && <RowMark tone="stop">GPS drift</RowMark>}
                    {i === bestIndex && <RowMark tone="mark">Best</RowMark>}
                    <span className="t-data ml-auto shrink-0 text-sm">
                      {analyzable ? format(kw) : <Na title="Could not be analysed" />}
                    </span>
                  </div>

                  <div className="mt-2">
                    <PullSparkline samples={p.samples} />
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="t-annotation">
                      {mpsToKmh(p.pull.v_start_mps).toFixed(0)} to{' '}
                      {mpsToKmh(p.pull.v_peak_mps).toFixed(0)} km/h
                    </span>
                    <span className="t-annotation">{(p.pull.duration_ms / 1000).toFixed(1)} s</span>
                    <span className="t-annotation">
                      {analyzable ? (
                        `${p.analysis!.rpm_min.toFixed(0)}-${p.analysis!.rpm_max.toFixed(0)} RPM`
                      ) : (
                        <Na title="Could not be analysed" />
                      )}
                    </span>
                  </div>

                  {!analyzable && (
                    <p className="t-annotation mt-1.5" style={{ color: 'var(--color-caution)' }}>
                      This pull could not be analysed, so it cannot be saved as a run.
                    </p>
                  )}

                  {corrupt && (
                    <p className="t-body mt-1.5 text-[0.8125rem] leading-6" style={{ color: 'var(--color-ink)' }}>
                      The GPS lost the speed signal mid-pull and caught up in one step, so this
                      power figure is the receiver, not the bike. Ride this pull again.
                    </p>
                  )}
                </label>
              );
            })}
          </Zone>

          {/* role=alert, not the Advisory's own role=status: this one has to
              interrupt, because the next tap writes the bad figure to the DB. */}
          {corruptSelected > 0 && (
            <div role="alert">
              <Advisory>
                {corruptSelected === 1
                  ? 'One selected pull has a corrupt speed signal.'
                  : `${corruptSelected} selected pulls have a corrupt speed signal.`}{' '}
                Saving will store a power figure the bike never made.
              </Advisory>
            </div>
          )}

          <PlateButton
            variant="procedure"
            major
            onClick={saveSelected}
            disabled={selected.size === 0 || isSaving}
          >
            {isSaving ? 'Saving...' : selected.size <= 1 ? 'Save as run' : `Save ${selected.size} runs`}
          </PlateButton>

          <PlateLink to={`/vehicles/${vehicleId}`} className="w-full">
            Discard all
          </PlateLink>
        </>
      )}

      {state.kind === 'idle' && (
        <p className="t-annotation py-4 text-center">Initializing sensors...</p>
      )}
    </Plate>
  );
}
