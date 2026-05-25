import { AutoStopDetector } from './auto-stop-detector';
import { runReducer, initialRunState, type RunEvent } from './run-state-machine';
import { DEFAULT_AUTO_STOP_CONFIG, type AutoStopConfig, type RunState } from './types';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { Unsubscribe } from '@/shared/observable';
import type { IVehicleRepository, ICalibrationRepository, IRunRepository, ISampleRepository, IDerivedCurveRepository } from '@/api/repositories/types';
import type { Calibration, Sample } from '@/shared/types';
import { analyzeRun } from '@/analysis/pipeline';
import { nowIso } from '@/shared/iso-time';
import { SensorRecorder, type SensorRecording } from '@/sensors/recording';

export interface RunLiveSample {
  t_ms: number;
  speed_mps: number;
  rpm: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  heading_deg: number | null;
  quality: number;
  fix_rate_hz: number;
  recording: boolean;
}

export interface RunControllerOptions {
  sensor: SpeedSource;
  vehicleRepository: IVehicleRepository;
  calibrationRepository: ICalibrationRepository;
  runRepository: IRunRepository;
  sampleRepository: ISampleRepository;
  derivedCurveRepository: IDerivedCurveRepository;
  autoStop?: AutoStopConfig;
  onStateChange: (state: RunState) => void;
  onLiveSample?: (s: RunLiveSample) => void;
  onError?: (err: unknown) => void;
  onRecordingFinished?: (rec: SensorRecording) => void;
}

export class RunController {
  private state: RunState = initialRunState();
  private detector: AutoStopDetector;
  private unsub: Unsubscribe | null = null;
  private samples: Sample[] = [];
  private calibration: Calibration | null = null;
  private hasSeen_positive_accel = false;
  private finishingRun = false;
  private recorder: SensorRecorder | null = null;
  private sensorRunning = false;
  private fixTimestamps: number[] = [];

  constructor(private readonly opts: RunControllerOptions) {
    this.detector = new AutoStopDetector(opts.autoStop ?? DEFAULT_AUTO_STOP_CONFIG);
  }

  getState(): RunState {
    return this.state;
  }

  async ready(vehicleId: string, calibrationId: string): Promise<void> {
    const cal = await this.opts.calibrationRepository.get(calibrationId);
    if (!cal) throw new Error(`calibration not found: ${calibrationId}`);
    this.calibration = cal;
    this.transition({
      type: 'READY',
      vehicle_id: vehicleId,
      calibration_id: cal.id,
      gear_label: cal.gear_label,
    });
  }

  /**
   * Start the sensor in warmup mode: live samples flow through onLiveSample
   * (so the UI can show GPS quality) but nothing is recorded to the DB.
   * Call start() once GPS is locked to promote to a recorded run.
   */
  async warmup(vehicleId: string, calibrationId: string): Promise<void> {
    if (this.sensorRunning) return;
    await this.ready(vehicleId, calibrationId);
    this.unsub = this.opts.sensor.samples$.subscribe((s) => this.onSample(s));
    await this.opts.sensor.start();
    this.sensorRunning = true;
  }

  async start(): Promise<void> {
    if (this.state.kind !== 'ready') throw new Error('start() requires ready state');
    if (!this.calibration) throw new Error('no calibration');
    const vehicleId = this.state.vehicle_id;
    const calibrationId = this.state.calibration_id;
    const gearLabel = this.state.gear_label;
    const run = await this.opts.runRepository.create({
      vehicle_id: vehicleId,
      calibration_id: calibrationId,
      gear_label: gearLabel,
      conditions: {},
      notes: '',
    });
    this.detector.reset();
    this.samples = [];
    this.hasSeen_positive_accel = false;
    this.finishingRun = false;
    this.transition({ type: 'START', run_id: run.id, now_ms: 0 });

    if (this.opts.onRecordingFinished) {
      this.recorder = new SensorRecorder();
      this.recorder.start('run', {
        run_id: run.id,
        vehicle_id: vehicleId,
        calibration_id: calibrationId,
        gear_label: gearLabel,
      });
      this.recorder.attachGps(this.opts.sensor);
    }

    // If warmup() was called, the sensor is already running and subscribed.
    // Otherwise wire it up now.
    if (!this.sensorRunning) {
      this.unsub = this.opts.sensor.samples$.subscribe((s) => this.onSample(s));
      await this.opts.sensor.start();
      this.sensorRunning = true;
    }
  }

  /**
   * Tear down sensor/recorder regardless of state. Safe to call on screen
   * unmount whether or not a run is in progress.
   */
  async dispose(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
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

  async save(notes: string): Promise<void> {
    if (this.state.kind !== 'reviewing') throw new Error('save() requires reviewing state');
    const runId = this.state.run_id;
    await this.opts.runRepository.markComplete(runId);
    if (notes) {
      await this.opts.runRepository.updateNotes(runId, notes);
    }
    this.transition({ type: 'SAVE' });
  }

  async discard(): Promise<void> {
    if (this.state.kind === 'reviewing') {
      await this.opts.runRepository.markAborted(this.state.run_id);
      this.transition({ type: 'DISCARD' });
    } else if (this.state.kind === 'running') {
      const runId = this.state.run_id;
      this.unsub?.();
      this.unsub = null;
      await this.opts.sensor.stop();
      this.sensorRunning = false;
      if (this.recorder) {
        const rec = this.recorder.finish({ run_id: runId });
        this.recorder = null;
        if (rec) this.opts.onRecordingFinished?.(rec);
      }
      await this.opts.runRepository.markAborted(runId);
      this.transition({ type: 'ABORT' });
    }
  }

  reset(): void {
    this.transition({ type: 'RESET' });
    this.samples = [];
    this.calibration = null;
  }

  private onSample(s: SensorSample<SpeedValue>): void {
    if (!this.calibration) return;

    this.fixTimestamps.push(s.t_ms);
    if (this.fixTimestamps.length > 10) this.fixTimestamps.shift();
    const span_ms = this.fixTimestamps.length > 1
      ? this.fixTimestamps[this.fixTimestamps.length - 1] - this.fixTimestamps[0]
      : 0;
    const fix_rate_hz = span_ms > 0 ? (this.fixTimestamps.length - 1) / (span_ms / 1000) : 0;

    const recording = this.state.kind === 'running';

    if (this.opts.onLiveSample) {
      const rpm = (s.value.speed_mps / this.calibration.rollout_m_per_rev) * 60;
      this.opts.onLiveSample({
        t_ms: s.t_ms,
        speed_mps: s.value.speed_mps,
        rpm,
        accuracy_m: s.value.accuracy_m ?? null,
        altitude_m: s.value.altitude_m ?? null,
        heading_deg: s.value.heading_deg ?? null,
        quality: s.quality,
        fix_rate_hz,
        recording,
      });
    }

    if (!recording) return;

    const run_id = this.state.kind === 'running' ? this.state.run_id : null;
    if (!run_id) return;

    const prevSpeed = this.samples.length > 0 ? this.samples[this.samples.length - 1].speed_mps : null;
    if (prevSpeed !== null && s.value.speed_mps > prevSpeed) {
      this.hasSeen_positive_accel = true;
    }

    const sample: Sample = {
      run_id,
      t_ms: s.t_ms,
      speed_mps: s.value.speed_mps,
      accel_long_ms2: null,
      accel_vert_ms2: null,
      lat: null,
      lon: null,
      hdop: null,
    };
    this.samples.push(sample);
    this.detector.push({ t_ms: s.t_ms, speed_mps: s.value.speed_mps });

    if (this.hasSeen_positive_accel && this.detector.check(s.t_ms)) {
      void this.finishRun().catch((err) => {
        this.opts.onError?.(err);
      });
    }
  }

  async stopNow(): Promise<void> {
    if (this.state.kind === 'running') {
      try {
        await this.finishRun();
      } catch (err) {
        this.opts.onError?.(err);
        throw err;
      }
    }
  }

  private async finishRun(): Promise<void> {
    if (this.state.kind !== 'running' || this.finishingRun) return;
    this.finishingRun = true;
    const runId = this.state.run_id;
    this.unsub?.();
    this.unsub = null;
    await this.opts.sensor.stop();
    this.sensorRunning = false;
    if (this.recorder) {
      const rec = this.recorder.finish({ run_id: runId });
      this.recorder = null;
      if (rec) this.opts.onRecordingFinished?.(rec);
    }
    await this.opts.runRepository.finalize(runId, nowIso());
    this.transition({ type: 'STOP' });

    if (!this.calibration) throw new Error('no calibration during analysis');
    const vehicle = await this.opts.vehicleRepository.get(this.calibration.vehicle_id);
    if (!vehicle) throw new Error('vehicle not found during analysis');

    await this.opts.sampleRepository.insertMany(this.samples);
    const result = analyzeRun({
      samples: this.samples.map((s) => ({ t_ms: s.t_ms, speed_mps: s.speed_mps })),
      mass_kg: vehicle.mass_kg,
      rollout_m_per_rev: this.calibration.rollout_m_per_rev,
    });
    await this.opts.derivedCurveRepository.upsert({
      run_id: runId,
      rpm_min: result.rpm_min,
      rpm_max: result.rpm_max,
      points: result.points,
      pipeline_version: result.pipeline_version,
      computed_at: nowIso(),
    });
    this.transition({ type: 'ANALYSIS_DONE' });
  }

  private transition(event: RunEvent): void {
    this.state = runReducer(this.state, event);
    this.opts.onStateChange(this.state);
  }
}
