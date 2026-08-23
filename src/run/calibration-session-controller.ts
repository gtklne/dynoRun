import {
  calibrationSessionReducer,
  initialCalibrationSessionState,
  type CalibrationSessionEvent,
} from './calibration-session-state-machine';
import { CalibrationStabilityDetector } from './calibration-stability-detector';
import { StandstillDetector, type StandstillProgress } from './standstill-detector';
import { SensorWatchdog } from './sensor-watchdog';
import {
  DEFAULT_STABILITY_WINDOW,
  MAX_SESSION_DURATION_MS,
  PLAUSIBLE_ROLLOUT_M_PER_REV,
  type CalibrationCandidate,
  type CalibrationSessionState,
  type StabilityWindow,
  type StandstillConfig,
} from './types';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { Unsubscribe } from '@/shared/observable';
import type { ICalibrationRepository } from '@/api/repositories/types';
import type { Calibration, UUID } from '@/shared/types';
import type { RawSpeedSample } from '@/analysis/types';
import {
  detectPlateaus,
  slicePlateauSamples,
  type PlateauDetectionConfig,
} from '@/analysis/plateau-detection';
import { computeRollout, mpsToKmh } from '@/shared/units';
import { SensorRecorder, type SensorRecording } from '@/sensors/recording';

/**
 * Two consecutive holds closer than this in speed are the same hold as far as
 * the rider's ear is concerned, so the second one is not announced. Without it
 * a steady motorway cruise would call out every few seconds.
 */
const HOLD_CUE_DEDUPE_KMH = 2;

export interface CalibrationSessionLiveSample {
  t_ms: number;
  speed_kmh: number;
  quality: number;
  accuracy_m: number | null;
  fix_rate_hz: number;
  recording: boolean;
}

export interface CalibrationSessionControllerOptions {
  sensor: SpeedSource;
  calibrationRepository: ICalibrationRepository;
  maxDurationMs?: number;
  detection?: Partial<PlateauDetectionConfig>;
  standstill?: Partial<StandstillConfig>;
  stabilityWindow?: StabilityWindow;
  sensorStallMs?: number;
  watchdogTickMs?: number;
  onStateChange: (state: CalibrationSessionState) => void;
  onLiveSample?: (s: CalibrationSessionLiveSample) => void;
  onStandstillProgress?: (p: StandstillProgress) => void;
  /**
   * A qualifying steady hold just completed, mid-ride. This is the whole point
   * of the live detector here: the rider cannot see the screen, so hearing
   * "steady at 90" is the only confirmation that the hold they were trying to
   * make actually registered.
   */
  onHoldConfirmed?: (speed_kmh: number) => void;
  onSensorWarning?: (message: string) => void;
  onError?: (err: unknown) => void;
  onRecordingFinished?: (rec: SensorRecording) => void;
}

/**
 * Hands-free calibration: record a whole ride, then find every steady-speed
 * hold in it and let the rider pick the one that was their deliberate attempt.
 *
 * The interactive wizard cannot work from a bike. It needs a tap before the
 * rider is at speed and another once the capture lands, and its live detector
 * latches on the FIRST steady window it sees, which on any real ride is the
 * cruise out to the test road in the wrong gear. Deferring the choice to a
 * review screen is what removes both problems: nothing is captured mid-ride,
 * so nothing can be captured wrongly.
 */
export class CalibrationSessionController {
  private state: CalibrationSessionState = initialCalibrationSessionState();
  private unsub: Unsubscribe | null = null;
  private errorUnsub: Unsubscribe | null = null;
  private samples: RawSpeedSample[] = [];
  private recorder: SensorRecorder | null = null;
  private sensorRunning = false;
  private finishing = false;
  private fixTimestamps: number[] = [];
  private readonly maxDurationMs: number;
  private readonly standstill: StandstillDetector;
  private readonly watchdog: SensorWatchdog;
  private readonly holdCue: CalibrationStabilityDetector;
  private lastCuedSpeedKmh: number | null = null;

  constructor(private readonly opts: CalibrationSessionControllerOptions) {
    this.maxDurationMs = opts.maxDurationMs ?? MAX_SESSION_DURATION_MS;
    this.standstill = new StandstillDetector(opts.standstill);
    this.holdCue = new CalibrationStabilityDetector(opts.stabilityWindow ?? DEFAULT_STABILITY_WINDOW);
    this.watchdog = new SensorWatchdog({
      maxDurationMs: this.maxDurationMs,
      stallMs: opts.sensorStallMs,
      tickMs: opts.watchdogTickMs,
      onMaxDuration: () => this.autoFinish(),
      onStall: () => {
        this.opts.onSensorWarning?.(
          'GPS stopped reporting, so the recording was closed with what it had.',
        );
        this.autoFinish();
      },
    });
  }

  getState(): CalibrationSessionState {
    return this.state;
  }

  /** Sensor running, live samples flow to the UI, nothing buffered yet. */
  async warmup(vehicleId: UUID, gear: { gear_label: string; user_rpm: number }): Promise<void> {
    if (this.sensorRunning) return;
    this.transition({
      type: 'READY',
      vehicle_id: vehicleId,
      gear_label: gear.gear_label,
      user_rpm: gear.user_rpm,
    });
    this.unsub = this.opts.sensor.samples$.subscribe((s) => this.onSample(s));
    this.errorUnsub = this.opts.sensor.errors$?.subscribe((e) => {
      this.opts.onSensorWarning?.(e.message);
    }) ?? null;
    await this.opts.sensor.start();
    this.sensorRunning = true;
  }

  /** Begin buffering the whole ride. Purely local, nothing is written yet. */
  start(): void {
    if (this.state.kind !== 'ready') throw new Error('start() requires ready state');
    this.samples = [];
    this.finishing = false;
    this.standstill.reset();
    this.holdCue.reset();
    this.lastCuedSpeedKmh = null;
    if (this.opts.onRecordingFinished) {
      this.recorder = new SensorRecorder();
      this.recorder.start(
        'calibration',
        {
          vehicle_id: this.state.vehicle_id,
          gear_label: this.state.gear_label,
          user_rpm: this.state.user_rpm,
          label: 'Hands-free calibration',
        },
        { motion: false },
      );
      this.recorder.attachGps(this.opts.sensor);
    }
    this.watchdog.start();
    this.transition({ type: 'START' });
  }

  /** Stop the sensor, persist the raw recording, find the holds in the buffer. */
  async finish(): Promise<void> {
    if (this.state.kind !== 'recording' || this.finishing) return;
    this.finishing = true;
    this.watchdog.stop();
    this.unsub?.();
    this.unsub = null;
    try { await this.opts.sensor.stop(); } catch { /* keep going: detection is local */ }
    this.sensorRunning = false;
    if (this.recorder) {
      const rec = this.recorder.finish();
      this.recorder = null;
      if (rec) this.opts.onRecordingFinished?.(rec);
    }
    this.transition({ type: 'FINISH' });

    let candidates: CalibrationCandidate[] = [];
    try {
      candidates = this.buildCandidates();
    } catch (err) {
      this.opts.onError?.(err);
    }
    this.transition({ type: 'CANDIDATES_READY', candidates });
  }

  private buildCandidates(): CalibrationCandidate[] {
    if (this.state.kind !== 'detecting') throw new Error('no gear context during detection');
    const { user_rpm } = this.state;
    return detectPlateaus(this.samples, this.opts.detection).map((plateau) => {
      const rollout_m_per_rev = computeRollout(user_rpm, plateau.mean_speed_kmh);
      return {
        plateau,
        samples: slicePlateauSamples(this.samples, plateau),
        rollout_m_per_rev,
        plausible:
          rollout_m_per_rev >= PLAUSIBLE_ROLLOUT_M_PER_REV.min &&
          rollout_m_per_rev <= PLAUSIBLE_ROLLOUT_M_PER_REV.max,
      };
    });
  }

  /**
   * Turn the chosen hold into the vehicle's calibration. Implausible
   * candidates are refused here as well as in the UI: a rollout outside the
   * band would divide into every future run's RPM axis.
   */
  async saveSelected(index: number): Promise<Calibration | null> {
    if (this.state.kind !== 'reviewing') throw new Error('saveSelected() requires reviewing state');
    const { candidates, vehicle_id, gear_label, user_rpm } = this.state;
    const chosen = candidates[index];
    if (!chosen || !chosen.plausible) {
      this.opts.onError?.(new Error('no usable steady hold selected'));
      return null;
    }
    this.transition({ type: 'SAVE_START' });
    try {
      const cal = await this.opts.calibrationRepository.create({
        vehicle_id,
        gear_label,
        rpm: user_rpm,
        speed_kmh: chosen.plateau.mean_speed_kmh,
        notes: 'Hands-free calibration',
      });
      this.transition({ type: 'SAVE_DONE', calibration_id: cal.id });
      return cal;
    } catch (err) {
      this.transition({ type: 'SAVE_FAILED' });
      this.opts.onError?.(err);
      return null;
    }
  }

  /** Safe on unmount in any state; a still-open recording is still persisted. */
  async dispose(): Promise<void> {
    this.watchdog.stop();
    this.unsub?.();
    this.unsub = null;
    this.errorUnsub?.();
    this.errorUnsub = null;
    if (this.recorder) {
      const rec = this.recorder.finish();
      this.recorder = null;
      if (rec) this.opts.onRecordingFinished?.(rec);
    }
    if (this.sensorRunning) {
      try { await this.opts.sensor.stop(); } catch { /* noop */ }
      this.sensorRunning = false;
    }
  }

  private onSample(s: SensorSample<SpeedValue>): void {
    this.watchdog.beat();
    this.fixTimestamps.push(s.t_ms);
    if (this.fixTimestamps.length > 10) this.fixTimestamps.shift();
    const span_ms = this.fixTimestamps.length > 1
      ? this.fixTimestamps[this.fixTimestamps.length - 1] - this.fixTimestamps[0]
      : 0;
    const fix_rate_hz = span_ms > 0 ? (this.fixTimestamps.length - 1) / (span_ms / 1000) : 0;

    const recording = this.state.kind === 'recording';

    this.opts.onLiveSample?.({
      t_ms: s.t_ms,
      speed_kmh: mpsToKmh(s.value.speed_mps),
      quality: s.quality,
      accuracy_m: s.value.accuracy_m ?? null,
      fix_rate_hz,
      recording,
    });

    if (!recording) return;

    this.samples.push({
      t_ms: s.t_ms,
      speed_mps: s.value.speed_mps,
      altitude_m: s.value.altitude_m ?? null,
    });

    this.cueHold(s);

    this.standstill.push({ t_ms: s.t_ms, speed_mps: s.value.speed_mps });
    this.opts.onStandstillProgress?.(this.standstill.progress());
    if (this.standstill.check()) {
      this.autoFinish();
      return;
    }

    const elapsed = s.t_ms - this.samples[0].t_ms;
    if (elapsed >= this.maxDurationMs) this.autoFinish();
  }

  /**
   * Audio feedback only. This detector never decides anything: what gets saved
   * comes from `detectPlateaus` over the whole buffer once the ride is done, so
   * a cue firing on incidental cruising costs nothing but a spoken number.
   */
  private cueHold(s: SensorSample<SpeedValue>): void {
    if (!this.opts.onHoldConfirmed) return;
    this.holdCue.push({ t_ms: s.t_ms, speed_mps: s.value.speed_mps });
    const held = this.holdCue.check(s.t_ms);
    if (!held) return;
    this.holdCue.reset();
    const speed = held.captured_speed_kmh;
    if (
      this.lastCuedSpeedKmh != null &&
      Math.abs(speed - this.lastCuedSpeedKmh) < HOLD_CUE_DEDUPE_KMH
    ) {
      return;
    }
    this.lastCuedSpeedKmh = speed;
    this.opts.onHoldConfirmed(speed);
  }

  private autoFinish(): void {
    if (this.state.kind !== 'recording' || this.finishing) return;
    void this.finish().catch((err) => this.opts.onError?.(err));
  }

  private transition(event: CalibrationSessionEvent): void {
    this.state = calibrationSessionReducer(this.state, event);
    this.opts.onStateChange(this.state);
  }
}
