import { useEffect, useRef, useState } from 'react';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { recordingRepository } from '@/api/repositories/recording-repository';
import {
  CalibrationSessionController,
  type CalibrationSessionLiveSample,
} from '@/run/calibration-session-controller';
import type { CalibrationSessionState, CalibrationCandidate } from '@/run/types';
import type { StandstillProgress } from '@/run/standstill-detector';
import { useSpeedSourceFactory } from './speed-source-context';
import { PlateauSparkline } from './plateau-sparkline';
import type { GearInput } from './calibration-step-gear';
import type { Calibration } from '@/shared/types';
import { setLastRecording } from '@/sensors/replay-state';
import { WakeLock } from '@/app/wake-lock';
import { speak } from '@/app/speech';
import { pulseStart, pulseStop, pulseTick } from '@/app/haptics';
import {
  Advisory,
  MinimaTable,
  NoReading,
  NotesBox,
  PlateButton,
  PlateLink,
  Readout,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';
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

interface CandidateRow {
  candidate: CalibrationCandidate;
  index: number;
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

  const rows: CandidateRow[] = candidates.map((candidate, index) => ({ candidate, index }));

  const columns: MinimaColumn<CandidateRow>[] = [
    {
      key: 'keep',
      head: 'Keep',
      cell: ({ candidate, index }) => (
        <input
          type="radio"
          name="calibration-candidate"
          checked={selected === index}
          disabled={!candidate.plausible}
          onChange={() => setSelected(index)}
          aria-label={`Keep the ${candidate.plateau.mean_speed_kmh.toFixed(1)} km/h hold`}
          className="h-5 w-5 align-middle"
        />
      ),
    },
    {
      key: 'speed',
      head: 'Speed (km/h)',
      numeric: true,
      cell: ({ candidate, index }) => (
        <>
          <span className="t-data text-base">{candidate.plateau.mean_speed_kmh.toFixed(1)}</span>
          {index === 0 && candidate.plausible && (
            <span className="t-annotation mt-0.5 block" style={{ color: 'var(--color-ink)' }}>
              Steadiest
            </span>
          )}
        </>
      ),
    },
    {
      key: 'at',
      head: 'At',
      numeric: true,
      cell: ({ candidate }) => formatElapsed(candidate.plateau.t_start_ms),
    },
    {
      key: 'profile',
      head: 'Profile',
      cell: ({ candidate }) => (
        <div style={{ minWidth: 200 }}>
          <PlateauSparkline samples={candidate.samples} />
        </div>
      ),
    },
    {
      key: 'rollout',
      head: 'Rollout (m/rev)',
      numeric: true,
      cell: ({ candidate }) => candidate.rollout_m_per_rev.toFixed(3),
    },
    {
      key: 'implies',
      head: `Implies in ${gear.gear_label}`,
      cell: ({ candidate }) =>
        candidate.plausible ? (
          <span className="t-data text-xs">
            {((candidate.plateau.mean_speed_kmh / gear.user_rpm) * 1000).toFixed(1)} km/h per 1,000
            RPM
          </span>
        ) : (
          <span className="t-annotation" style={{ color: 'var(--color-caution)' }}>
            Outside any usable gear ratio for {gear.user_rpm.toLocaleString()} RPM, so it cannot be
            saved
          </span>
        ),
    },
  ];

  return (
    <>
      {warning && <Advisory>{warning}</Advisory>}

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
                  Start the recording here while stopped, then put the phone away.
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
                  Ride, settle into <span className="t-data">{gear.gear_label}</span>, and hold{' '}
                  <span className="t-data">{gear.user_rpm.toLocaleString()} RPM</span> on your own
                  tacho for about five seconds. You will hear the speed called out when a hold
                  registers.
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
                  Come to a stop. The recording ends itself shortly after, and you pick which hold
                  to keep.
                </span>
              </li>
            </ol>
          </Zone>

          <NotesBox title="Why this is safe">
            Nothing is captured while you ride, so a steady stretch in the wrong gear cannot spoil
            the calibration. Hold as many times as you like: you choose the one you meant once you
            have stopped.
          </NotesBox>

          <GpsWarmupCard
            telemetry={live ? { accuracy_m: live.accuracy_m, quality: live.quality, fix_rate_hz: live.fix_rate_hz } : null}
            currentSpeedKmh={live?.speed_kmh ?? null}
            warmupStartedAt={warmupStartedAt}
            goodSince={goodSince}
            now={now}
            poorOutcome="calibration"
          />

          <div className="space-y-3">
            <PlateButton variant="procedure" major onClick={startSession} disabled={!canStart}>
              {showPoorWarning && forceStart ? 'Start recording anyway' : 'Start recording'}
            </PlateButton>
            {showPoorWarning && !forceStart && (
              <button
                type="button"
                onClick={() => setForceStart(true)}
                className="t-annotation w-full py-2 underline underline-offset-4"
              >
                Start anyway (calibration will be unreliable)
              </button>
            )}
          </div>
        </>
      )}

      {isRecording && (
        <>
          {/* The one earned accent plane while recording: trackside, the live
              speed is the sheet. Annotation register inside it, because
              `.plane-ink` remaps that one and leaves body copy behind. */}
          <Zone
            label="Recording"
            note={`Elapsed ${formatElapsed(elapsed)}`}
            accent={live != null}
            flush
           
          >
            <div className="rule-b px-3 py-4">
              {live == null ? (
                <NoReading label="Speed" reason="No fix yet" />
              ) : (
                <Readout label="Speed" value={live.speed_kmh.toFixed(0)} unit="km/h" size="xl" />
              )}
            </div>
            <p className="t-annotation px-3 py-2 normal-case tracking-normal">
              Hold {gear.user_rpm.toLocaleString()} RPM in {gear.gear_label}. Listen for the
              callout.
            </p>
          </Zone>

          <Zone
            label="Holds heard so far"
            note={heardHolds.length === 0 ? 'none yet' : `${heardHolds.length} registered`}
          >
            {heardHolds.length === 0 ? (
              <p className="t-body text-[0.8125rem] leading-6">
                None yet. Settle at a constant RPM and wait five seconds.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {heardHolds.map((s, i) => (
                  <span key={i} className="plane-2 t-data px-2 py-0.5 text-xs">
                    {s.toFixed(1)} km/h
                  </span>
                ))}
              </div>
            )}
          </Zone>

          {countingDown && (
            <Advisory>
              Stopped. Finishing by itself in {Math.ceil((standstill?.remaining_ms ?? 0) / 1000)} s.
              Ride on to cancel.
            </Advisory>
          )}

          <div className="space-y-2">
            <HoldToFinishButton onFinish={finishSession} label="Hold to finish now" />
            <p className="t-annotation text-center">
              Hold for 1.5 s, so stray pocket touches will not stop the recording.
            </p>
          </div>
        </>
      )}

      {isDetecting && (
        <p className="t-label py-10 text-center">Looking for steady holds...</p>
      )}

      {(isReviewing || isSaving) && candidates.length === 0 && (
        <>
          <Zone label="No steady speed found">
            <p className="t-body text-[0.875rem] leading-6">
              The ride never held a constant speed for long enough (about five seconds above
              20 km/h, within 1.5 km/h). Ride a flat road with little traffic and settle on the
              throttle before you start counting. The raw recording was saved, so you can inspect
              it in the Replay Lab.
            </p>
          </Zone>
          <div className="grid grid-cols-2 gap-2.5">
            <PlateButton type="button" onClick={onCancel} className="w-full">
              Back
            </PlateButton>
            <PlateLink to="/replay" className="w-full">
              Replay Lab
            </PlateLink>
          </div>
        </>
      )}

      {(isReviewing || isSaving) && candidates.length > 0 && (
        <>
          <Zone
            label={`Which hold was ${gear.user_rpm.toLocaleString()} RPM in ${gear.gear_label}?`}
            note={
              candidates.length === 1
                ? 'One steady hold, best first'
                : `${candidates.length} steady holds, best first`
            }
            flush
          >
            <p className="rule-b t-body px-3 py-2 text-[0.8125rem] leading-6">
              Pick the speed you remember seeing. Only you know which hold you meant, so the app
              does not guess.
            </p>
            <MinimaTable
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.index)}
              selectedKey={String(selected)}
              onSelect={(r) => {
                if (r.candidate.plausible) setSelected(r.index);
              }}
            />
          </Zone>

          <PlateButton
            variant="procedure"
            major
            onClick={save}
            disabled={usable === 0 || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save calibration'}
          </PlateButton>
        </>
      )}

      {state.kind === 'idle' && (
        <p className="t-annotation py-4 text-center">Initializing sensors...</p>
      )}

      {(isReady || isReviewing) && (
        <PlateButton type="button" onClick={onCancel} className="w-full">
          Cancel
        </PlateButton>
      )}
    </>
  );
}
