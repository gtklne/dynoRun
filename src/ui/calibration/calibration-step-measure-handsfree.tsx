import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { recordingRepository } from '@/api/repositories/recording-repository';
import {
  CalibrationSessionController,
  type CalibrationSessionLiveSample,
} from '@/run/calibration-session-controller';
import type { CalibrationSessionState } from '@/run/types';
import type { StandstillProgress } from '@/run/standstill-detector';
import { useSpeedSourceFactory } from './speed-source-context';
import { PlateauSparkline } from './plateau-sparkline';
import type { GearInput } from './calibration-step-gear';
import type { Calibration } from '@/shared/types';
import { setLastRecording } from '@/sensors/replay-state';
import { WakeLock } from '@/app/wake-lock';
import { speak } from '@/app/speech';
import { pulseStart, pulseStop, pulseTick } from '@/app/haptics';
import { GpsWarmupCard, isGpsLocked, isGpsPoor, GPS_ACCURACY_GOOD_M } from '@/ui/components/gps-warmup-card';
import { HoldToFinishButton } from '@/ui/session/hold-to-finish-button';
import { useToast } from '@/ui/components/toast';

interface Props {
  vehicleId: string;
  gear: GearInput;
  onConfirmed: (cal: Calibration) => void;
  onCancel: () => void;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CalibrationStepMeasureHandsFree({ vehicleId, gear, onConfirmed, onCancel }: Props) {
  const speedSourceFactory = useSpeedSourceFactory();
  const toast = useToast();
  const [state, setState] = useState<CalibrationSessionState>({ kind: 'idle' });
  const [live, setLive] = useState<CalibrationSessionLiveSample | null>(null);
  const [standstill, setStandstill] = useState<StandstillProgress | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [heardHolds, setHeardHolds] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);
  const [warmupStartedAt] = useState<number>(() => Date.now());
  const [goodSince, setGoodSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [forceStart, setForceStart] = useState(false);
  const ctrlRef = useRef<CalibrationSessionController | null>(null);
  const wakeLockRef = useRef(new WakeLock());
  const startedWallRef = useRef<number | null>(null);
  // Latches the spoken standstill warning so it is announced once per stop and
  // not once per GPS sample, which would have the phone talking over itself.
  const announcedStopRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sensor = await speedSourceFactory();
      const ctrl = new CalibrationSessionController({
        sensor,
        calibrationRepository,
        onStateChange: (s) => {
          if (cancelled) return;
          setState(s);
          if (s.kind === 'reviewing') {
            void wakeLockRef.current.release();
            // The first plausible one, not simply the first: candidates are
            // sorted by score, so index 0 can be unsaveable while a later one
            // is fine, which would arm the save button on a refused pick.
            const firstUsable = s.candidates.findIndex((c) => c.plausible);
            setSelected(firstUsable >= 0 ? firstUsable : 0);
            speak(
              s.candidates.length === 0
                ? 'Recording finished. No steady speed found.'
                : `Recording finished. ${s.candidates.length} steady ${
                  s.candidates.length === 1 ? 'hold' : 'holds'
                } to choose from.`,
            );
          }
        },
        onLiveSample: (sample) => {
          if (cancelled) return;
          setLive(sample);
          if (sample.accuracy_m != null && sample.accuracy_m <= GPS_ACCURACY_GOOD_M) {
            setGoodSince((prev) => prev ?? Date.now());
          } else {
            setGoodSince(null);
          }
        },
        onStandstillProgress: (p) => {
          if (cancelled) return;
          setStandstill(p);
          if (p.armed && p.stopped) {
            if (!announcedStopRef.current) {
              announcedStopRef.current = true;
              speak('Stopped. Finishing shortly unless you ride on.');
            }
          } else if (!p.stopped) {
            announcedStopRef.current = false;
          }
        },
        onHoldConfirmed: (speed_kmh) => {
          if (cancelled) return;
          setHeardHolds((prev) => [...prev, speed_kmh]);
          pulseTick();
          speak(`Steady at ${Math.round(speed_kmh)}`);
        },
        onSensorWarning: (message) => {
          // Deliberately not a toast: with the phone in a pocket the rider
          // never sees one, and this has to still be on screen afterwards.
          if (!cancelled) setWarning(message);
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
            console.error('Failed to upload calibration recording:', err);
          });
        },
        onError: (err) => {
          if (cancelled) return;
          console.error('CalibrationSessionController error:', err);
          const message = err instanceof Error ? err.message : 'Calibration failed';
          toast.show(message, { variant: 'error' });
        },
      });
      ctrlRef.current = ctrl;
      try {
        await ctrl.warmup(vehicleId, gear);
      } catch (err) {
        if (!cancelled) {
          console.error('Calibration session warmup failed:', err);
          toast.show('Could not start sensors for this calibration', { variant: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.dispose();
      void wakeLockRef.current.release();
      ctrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startSession() {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    // A denied wake lock (battery saver, permission policy) must not block the
    // ride: the rider just has to keep the screen on themselves.
    try { await wakeLockRef.current.acquire(); } catch (err) { console.warn('Wake lock unavailable:', err); }
    startedWallRef.current = Date.now();
    announcedStopRef.current = false;
    pulseStart();
    speak(
      `Recording started. Put the phone away, then hold ${gear.user_rpm} RPM in ${gear.gear_label}.`,
    );
    ctrl.start();
  }

  function finishSession() {
    pulseStop();
    speak('Recording stopped. Looking for your steady holds.');
    void ctrlRef.current?.finish();
  }

  async function save() {
    const cal = await ctrlRef.current?.saveSelected(selected);
    if (cal) onConfirmed(cal);
  }

  const isReady = state.kind === 'ready';
  const isRecording = state.kind === 'recording';
  const isDetecting = state.kind === 'detecting';
  const isReviewing = state.kind === 'reviewing';
  const isSaving = state.kind === 'saving';
  const candidates = state.kind === 'reviewing' || state.kind === 'saving' ? state.candidates : [];
  const usable = candidates.filter((c) => c.plausible).length;

  const gpsLocked = isGpsLocked(goodSince, now);
  const showPoorWarning = isReady && isGpsPoor(goodSince, warmupStartedAt, now);
  const canStart = isReady && (gpsLocked || forceStart);
  const elapsed = startedWallRef.current != null ? now - startedWallRef.current : 0;
  const countingDown = standstill != null && standstill.armed && standstill.stopped;

  return (
    <div className="space-y-4">
      {warning && (
        <div className="bg-zinc-900 border border-red-800/60 rounded-2xl p-4">
          <p className="text-red-400 text-xs font-semibold uppercase tracking-widest mb-1">Sensor problem</p>
          <p className="text-zinc-300 text-sm">{warning}</p>
        </div>
      )}

      {isReady && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-widest">How it works</p>
            <ol className="text-zinc-400 text-sm space-y-1.5 list-decimal list-inside">
              <li>Start the recording here while stopped, then put the phone away.</li>
              <li>
                Ride, settle into <span className="text-zinc-200 font-medium">{gear.gear_label}</span>, and hold{' '}
                <span className="text-zinc-200 font-medium">{gear.user_rpm.toLocaleString()} RPM</span> on your own
                tacho for about five seconds. You will hear the speed called out when a hold registers.
              </li>
              <li>
                Come to a stop. The recording ends itself shortly after, and you pick which hold to keep.
              </li>
            </ol>
            <p className="text-zinc-600 text-xs pt-1">
              Nothing is captured while you ride, so a steady stretch in the wrong gear cannot spoil the
              calibration. Hold as many times as you like.
            </p>
          </div>

          <GpsWarmupCard
            telemetry={live ? { accuracy_m: live.accuracy_m, quality: live.quality, fix_rate_hz: live.fix_rate_hz } : null}
            currentSpeedKmh={live?.speed_kmh ?? null}
            warmupStartedAt={warmupStartedAt}
            goodSince={goodSince}
            now={now}
            poorOutcome="calibration"
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
            {showPoorWarning && forceStart ? 'Start recording anyway' : 'Start recording'}
          </button>
          {showPoorWarning && !forceStart && (
            <button
              onClick={() => setForceStart(true)}
              className="w-full text-zinc-500 hover:text-zinc-300 text-xs underline underline-offset-2"
            >
              Start anyway (calibration will be unreliable)
            </button>
          )}
        </>
      )}

      {isRecording && (
        <>
          <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-semibold uppercase tracking-widest">Recording</span>
              <span className="ml-auto tabular-nums text-zinc-100 text-xl font-bold">{formatElapsed(elapsed)}</span>
            </div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Speed</p>
            <p className="tabular-nums">
              <span className="text-5xl font-bold text-zinc-100">
                {live != null ? live.speed_kmh.toFixed(0) : 'n/a'}
              </span>
              <span className="text-sm text-zinc-500 ml-1">km/h</span>
            </p>
            <p className="text-zinc-400 text-sm mt-4">
              Hold {gear.user_rpm.toLocaleString()} RPM in {gear.gear_label}. Listen for the callout.
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Holds heard so far</p>
            {heardHolds.length === 0 ? (
              <p className="text-zinc-600 text-sm">None yet. Settle at a constant RPM and wait five seconds.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {heardHolds.map((s, i) => (
                  <span
                    key={i}
                    className="tabular-nums bg-amber-500/15 text-amber-400 text-xs font-semibold px-2.5 py-1 rounded-full"
                  >
                    {s.toFixed(1)} km/h
                  </span>
                ))}
              </div>
            )}
          </div>

          {countingDown && (
            <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest">Stopped</p>
                <p className="tabular-nums text-zinc-100 text-2xl font-bold">
                  {Math.ceil((standstill?.remaining_ms ?? 0) / 1000)}s
                </p>
              </div>
              <p className="text-zinc-400 text-sm mt-1">
                Finishing by itself. Ride on to cancel.
              </p>
            </div>
          )}

          <HoldToFinishButton onFinish={finishSession} label="Hold to finish now" />
          <p className="text-zinc-600 text-xs text-center">
            Hold for 1.5 s, so stray pocket touches won't stop the recording.
          </p>
        </>
      )}

      {isDetecting && (
        <div className="flex items-center justify-center gap-3 py-10">
          <div className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-amber-400 font-medium">Looking for steady holds…</p>
        </div>
      )}

      {(isReviewing || isSaving) && candidates.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <p className="text-zinc-100 font-semibold">No steady speed found</p>
          <p className="text-zinc-400 text-sm leading-relaxed">
            The ride never held a constant speed for long enough (about five seconds above 20 km/h, within
            1.5 km/h). Ride a flat road with little traffic and settle on the throttle before you start
            counting. The raw recording was saved, so you can inspect it in the Replay Lab.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm py-3 rounded-xl transition-colors"
            >
              Back
            </button>
            <Link
              to="/replay"
              className="flex-1 text-center bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-sm py-3 rounded-xl transition-colors"
            >
              Replay Lab
            </Link>
          </div>
        </div>
      )}

      {(isReviewing || isSaving) && candidates.length > 0 && (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-1">
            <p className="text-zinc-100 font-medium text-sm">
              Which hold was {gear.user_rpm.toLocaleString()} RPM in {gear.gear_label}?
            </p>
            <p className="text-zinc-500 text-xs">
              {candidates.length === 1 ? 'One steady hold' : `${candidates.length} steady holds`} found, best
              first. Pick the speed you remember seeing. Only you know which one you meant, so the app does
              not guess.
            </p>
          </div>

          <div className="space-y-2">
            {candidates.map((c, i) => {
              const checked = selected === i;
              const kmhPerRpm = c.plateau.mean_speed_kmh / gear.user_rpm;
              return (
                <button
                  key={i}
                  onClick={() => c.plausible && setSelected(i)}
                  disabled={!c.plausible}
                  aria-pressed={checked}
                  className={`w-full text-left bg-zinc-900 border rounded-2xl p-4 transition-colors ${
                    checked ? 'border-amber-500' : 'border-zinc-800'
                  } ${c.plausible ? 'hover:border-amber-700' : 'opacity-60 cursor-not-allowed'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        checked ? 'border-amber-500' : 'border-zinc-600'
                      }`}
                    >
                      {checked && <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />}
                    </div>
                    <p className="tabular-nums text-zinc-100 font-bold text-lg">
                      {c.plateau.mean_speed_kmh.toFixed(1)}
                      <span className="text-zinc-500 text-sm font-normal ml-1">km/h</span>
                    </p>
                    {i === 0 && c.plausible && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                        Steadiest
                      </span>
                    )}
                    <span className="ml-auto tabular-nums text-zinc-500 text-xs">
                      at {formatElapsed(c.plateau.t_start_ms)}
                    </span>
                  </div>

                  <PlateauSparkline samples={c.samples} />

                  <div className="flex items-baseline justify-between mt-2 text-xs text-zinc-500 tabular-nums">
                    <span>held {(c.plateau.duration_ms / 1000).toFixed(0)} s</span>
                    <span>±{(c.plateau.spread_kmh / 2).toFixed(2)} km/h</span>
                    <span>{c.rollout_m_per_rev.toFixed(3)} m/rev</span>
                  </div>
                  {c.plausible ? (
                    <p className="text-zinc-600 text-xs mt-1.5 tabular-nums">
                      Would put {(kmhPerRpm * 1000).toFixed(1)} km/h per 1,000 RPM in {gear.gear_label}.
                    </p>
                  ) : (
                    <p className="text-red-400 text-xs mt-1.5">
                      Outside any usable gear ratio for {gear.user_rpm.toLocaleString()} RPM, so it cannot be saved.
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={save}
            disabled={usable === 0 || isSaving}
            className={`w-full font-bold py-4 rounded-xl transition-colors text-lg ${
              usable > 0 && !isSaving
                ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            {isSaving ? 'Saving…' : 'Save calibration'}
          </button>
        </>
      )}

      {state.kind === 'idle' && (
        <div className="flex items-center justify-center py-4">
          <p className="text-zinc-500 text-sm">Initializing sensors…</p>
        </div>
      )}

      {(isReady || isReviewing) && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-3 rounded-xl transition-colors border border-zinc-700 text-sm"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
