import { AutoStopDetector } from './auto-stop-detector';
import { runReducer, initialRunState, type RunEvent } from './run-state-machine';
import { DEFAULT_AUTO_STOP_CONFIG, type AutoStopConfig, type RunState } from './types';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { Unsubscribe } from '@/shared/observable';
import type { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import type { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import type { RunRepository } from '@/storage/repositories/run-repository';
import type { SampleRepository } from '@/storage/repositories/sample-repository';
import type { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import type { Calibration, Sample } from '@/shared/types';
import { analyzeRun } from '@/analysis/pipeline';
import { nowIso } from '@/shared/iso-time';

export interface RunControllerOptions {
  sensor: SpeedSource;
  vehicleRepository: VehicleRepository;
  calibrationRepository: CalibrationRepository;
  runRepository: RunRepository;
  sampleRepository: SampleRepository;
  derivedCurveRepository: DerivedCurveRepository;
  autoStop?: AutoStopConfig;
  onStateChange: (state: RunState) => void;
  onLiveSample?: (s: { t_ms: number; speed_mps: number; rpm: number }) => void;
}

export class RunController {
  private state: RunState = initialRunState();
  private detector: AutoStopDetector;
  private unsub: Unsubscribe | null = null;
  private samples: Sample[] = [];
  private calibration: Calibration | null = null;
  private hasSeen_positive_accel = false;

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

  async start(): Promise<void> {
    if (this.state.kind !== 'ready') throw new Error('start() requires ready state');
    if (!this.calibration) throw new Error('no calibration');
    const run = await this.opts.runRepository.create({
      vehicle_id: this.state.vehicle_id,
      calibration_id: this.state.calibration_id,
      gear_label: this.state.gear_label,
      conditions: {},
      notes: '',
    });
    this.detector.reset();
    this.samples = [];
    this.hasSeen_positive_accel = false;
    this.transition({ type: 'START', run_id: run.id, now_ms: 0 });

    this.unsub = this.opts.sensor.samples$.subscribe((s) => this.onSample(s, run.id));
    await this.opts.sensor.start();
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
      await this.opts.runRepository.markAborted(runId);
      this.transition({ type: 'ABORT' });
    }
  }

  reset(): void {
    this.transition({ type: 'RESET' });
    this.samples = [];
    this.calibration = null;
  }

  private onSample(s: SensorSample<SpeedValue>, run_id: string): void {
    if (this.state.kind !== 'running') return;
    if (!this.calibration) return;

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

    if (this.opts.onLiveSample) {
      const rpm = (s.value.speed_mps / this.calibration.rollout_m_per_rev) * 60;
      this.opts.onLiveSample({ t_ms: s.t_ms, speed_mps: s.value.speed_mps, rpm });
    }

    if (this.hasSeen_positive_accel && this.detector.check(s.t_ms)) {
      void this.finishRun();
    }
  }

  async stopNow(): Promise<void> {
    if (this.state.kind === 'running') {
      await this.finishRun();
    }
  }

  private async finishRun(): Promise<void> {
    if (this.state.kind !== 'running') return;
    const runId = this.state.run_id;
    this.unsub?.();
    this.unsub = null;
    await this.opts.sensor.stop();
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
