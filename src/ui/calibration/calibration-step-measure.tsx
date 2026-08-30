import { useEffect, useRef, useState } from 'react';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { CalibrationController, type CalibrationLiveSample } from '@/run/calibration-controller';
import { useSpeedSourceFactory } from './speed-source-context';
import type { GearInput } from './calibration-step-gear';
import type { Calibration } from '@/shared/types';
import type { CalibrationState } from '@/run/types';
import { setLastRecording } from '@/sensors/replay-state';
import { recordingRepository } from '@/api/repositories/recording-repository';
import { Advisory, Na, NoReading, NotesBox, PlateButton, Readout, Zone } from '@/ui/plate';
import {
  GpsWarmupCard,
  isGpsLocked,
  isGpsPoor,
  GPS_ACCURACY_GOOD_M,
} from '@/ui/components/gps-warmup-card';
import {
  createMotionFusionState,
  onGpsFix,
  onMotionSample,
  type MotionFusionState,
} from '@/sensors/motion-fusion';

interface Props {
  vehicleId: string;
  gear: GearInput;
  onConfirmed: (cal: Calibration) => void;
  onCancel: () => void;
}

function headingLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/**
 * Out of tolerance takes caution ink; everything acceptable stays in plain ink.
 * Spending a second colour on "this reading is fine" would leave the one value
 * the driver has to act on competing with four that need no attention.
 */
function outOfTolerance(bad: boolean) {
  return bad ? { color: 'var(--color-caution)' } : undefined;
}

interface TelemetryRowProps {
  label: string;
  value: string | null;
  unit?: string;
  bad?: boolean;
}

function TelemetryRow({ label, value, unit, bad = false }: TelemetryRowProps) {
  return (
    <div className="rule-t flex items-baseline justify-between px-3 py-2 first:border-t-0">
      <dt className="t-annotation">{label}</dt>
      <dd className="t-data text-sm" style={outOfTolerance(bad)}>
        {value === null ? (
          <Na />
        ) : (
          <>
            {value}
            {unit && <span className="t-annotation ml-1">{unit}</span>}
          </>
        )}
      </dd>
    </div>
  );
}

export function CalibrationStepMeasure({ vehicleId, gear, onConfirmed, onCancel }: Props) {
  const speedSourceFactory = useSpeedSourceFactory();
  const [state, setState] = useState<CalibrationState>({ kind: 'idle' });
  const [live, setLive] = useState<CalibrationLiveSample | null>(null);
  const [displaySpeed, setDisplaySpeed] = useState<number | null>(null);
  const [warmupStartedAt, setWarmupStartedAt] = useState<number>(() => Date.now());
  const [goodSince, setGoodSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [forceStart, setForceStart] = useState(false);
  const ctrlRef = useRef<CalibrationController | null>(null);
  const fusionRef = useRef<MotionFusionState>(createMotionFusionState());

  // Tick so lock progress / poor-GPS warnings update even when no new GPS sample arrives.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // DeviceMotion listener: active only while measuring, integrates acceleration
  // between GPS fixes to give a high-frequency speed estimate.
  useEffect(() => {
    if (state.kind !== 'measuring') return;

    const handler = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (!a) return;
      const fused = onMotionSample(fusionRef.current, a.x ?? 0, a.y ?? 0, a.z ?? 0, performance.now());
      if (fused != null) {
        setDisplaySpeed(fused * 3.6);
      }
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [state.kind]);

  // Boot the GPS in warmup mode as soon as the screen mounts so the user can
  // see signal quality before triggering the actual measurement.
  useEffect(() => {
    let cancelled = false;
    setWarmupStartedAt(Date.now());
    (async () => {
      const sensor = await speedSourceFactory();
      const ctrl = new CalibrationController({
        vehicleId,
        speedSource: sensor,
        calibrationRepository,
        onStateChange: (s) => { if (!cancelled) setState(s); },
        onLiveSample: (sample) => {
          if (cancelled) return;
          const speed_mps = sample.speed_kmh / 3.6;
          onGpsFix(fusionRef.current, speed_mps);
          setLive(sample);
          setDisplaySpeed(sample.speed_kmh);

          if (sample.accuracy_m != null && sample.accuracy_m <= GPS_ACCURACY_GOOD_M) {
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
      await ctrl.warmup();
    })();
    return () => {
      cancelled = true;
      void ctrlRef.current?.dispose();
      ctrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (!ctrlRef.current) return;
    // iOS 13+ requires a user-gesture permission request for DeviceMotionEvent.
    const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DME.requestPermission === 'function') {
      try { await DME.requestPermission(); } catch { /* fall back to GPS-only */ }
    }
    fusionRef.current = createMotionFusionState();
    await ctrlRef.current.start({ gear_label: gear.gear_label, user_rpm: gear.user_rpm });
  }

  async function confirm() {
    if (!ctrlRef.current) return;
    const cal = await ctrlRef.current.confirm();
    await ctrlRef.current.stop();
    onConfirmed(cal);
  }

  const stabilityPct = live ? Math.min(1, live.stability.elapsed_ms / live.stability.window_ms) : 0;
  const deltaOk = live ? live.stability.speed_delta_kmh <= live.stability.max_delta_kmh : false;
  // Standing still is perfectly stable, so the bar would otherwise fill and
  // then sit at 100% forever while the detector quietly refuses to capture.
  const tooSlow = live?.stability.below_min_speed ?? false;

  const gpsLocked = isGpsLocked(goodSince, now);
  const showPoorWarning = state.kind === 'idle' && isGpsPoor(goodSince, warmupStartedAt, now);
  const canStart = state.kind === 'idle' && (gpsLocked || forceStart);

  return (
    <>
      <NotesBox title="What to do">
        Hold steady at {gear.user_rpm.toLocaleString()} RPM in {gear.gear_label}. Cruise at a
        constant speed on a flat road: the app captures your speed once it stabilises, and that one
        pair of numbers becomes the gear ratio.
      </NotesBox>

      {state.kind === 'idle' && (
        <GpsWarmupCard
          telemetry={live ? { accuracy_m: live.accuracy_m, quality: live.quality, fix_rate_hz: live.fix_rate_hz } : null}
          currentSpeedKmh={displaySpeed}
          warmupStartedAt={warmupStartedAt}
          goodSince={goodSince}
          now={now}
          poorOutcome="calibration"
        />
      )}

      {state.kind === 'measuring' && (
        <>
          <Zone
            label="Measuring"
            note={`${gear.gear_label}, target ${gear.user_rpm.toLocaleString()} RPM`}
          >
            <div className="rule-b px-3 py-4">
              {displaySpeed == null ? (
                <NoReading label="Current speed" reason="No fix yet" />
              ) : (
                <Readout
                  label="Current speed"
                  value={displaySpeed.toFixed(1)}
                  unit="km/h"
                  size="xl"
                />
              )}
            </div>

            <dl>
              <TelemetryRow
                label="Accuracy"
                value={live?.accuracy_m != null ? live.accuracy_m.toFixed(1) : null}
                unit="m"
                bad={live?.accuracy_m != null && live.accuracy_m > GPS_ACCURACY_GOOD_M}
              />
              <TelemetryRow
                label="Signal quality"
                value={live ? String(Math.round(live.quality * 100)) : null}
                unit="%"
                bad={live != null && live.quality < 0.4}
              />
              <TelemetryRow
                label="Fix rate"
                value={live?.fix_rate_hz != null ? live.fix_rate_hz.toFixed(1) : null}
                unit="Hz"
              />
              {live?.altitude_m != null && (
                <TelemetryRow label="Altitude" value={live.altitude_m.toFixed(0)} unit="m" />
              )}
              {live?.heading_deg != null && (
                <TelemetryRow
                  label="Heading"
                  value={`${live.heading_deg.toFixed(0)}° ${headingLabel(live.heading_deg)}`}
                />
              )}
            </dl>
          </Zone>

          {tooSlow && (
            <Advisory>
              Steady, but too slow to calibrate. Get above{' '}
              {live?.stability.min_speed_kmh.toFixed(0)} km/h in {gear.gear_label} and hold{' '}
              {gear.user_rpm.toLocaleString()} RPM.
            </Advisory>
          )}

          <Zone
            label="Stability"
            note={`${live ? (live.stability.elapsed_ms / 1000).toFixed(1) : '0.0'} s of ${live ? (live.stability.window_ms / 1000).toFixed(0) : '5'} s`}
          >
            <div className="px-3 py-3">
              <div
                className="h-2.5 w-full"
                role="progressbar"
                aria-label="Steady-hold progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(stabilityPct * 100)}
                style={{ border: 'var(--rule-hair) solid var(--color-rule)' }}
              >
                {/* Scaled rather than width-animated: a bar that updates on
                    every GPS fix should not thrash layout to do it. */}
                <div
                  className="h-full w-full origin-left"
                  style={{
                    transform: `scaleX(${stabilityPct})`,
                    background: tooSlow
                      ? 'var(--color-terrain)'
                      : deltaOk
                        ? 'var(--color-ink)'
                        : 'var(--color-caution)',
                    transition: 'transform 300ms var(--ease-plate)',
                  }}
                />
              </div>

              <div className="mt-2.5 flex items-baseline justify-between">
                <span className="t-annotation">Speed spread</span>
                <span className="t-data text-sm" style={outOfTolerance(!deltaOk)}>
                  {live ? `±${(live.stability.speed_delta_kmh / 2).toFixed(2)} km/h` : <Na />}
                  <span className="t-annotation ml-1.5">
                    max ±{live ? (live.stability.max_delta_kmh / 2).toFixed(1) : '0.5'}
                  </span>
                </span>
              </div>
            </div>
          </Zone>
        </>
      )}

      {state.kind === 'stable' && (
        <Zone label="Captured" note="Steady hold locked">
          <div className="px-3 py-4">
            <Readout
              label="Captured speed"
              value={state.captured_speed_kmh.toFixed(1)}
              unit="km/h"
              size="xl"
            />
          </div>
        </Zone>
      )}

      <div className="space-y-3">
        {state.kind === 'idle' && (
          <>
            <PlateButton variant="procedure" major onClick={start} disabled={!canStart}>
              {showPoorWarning && forceStart ? 'Start anyway' : 'Start measurement'}
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
          </>
        )}
        {state.kind === 'stable' && (
          <PlateButton variant="procedure" major onClick={confirm}>
            Save calibration
          </PlateButton>
        )}
        <PlateButton type="button" onClick={onCancel} className="w-full">
          Cancel
        </PlateButton>
      </div>
    </>
  );
}
