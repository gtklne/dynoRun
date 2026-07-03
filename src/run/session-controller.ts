import { sessionReducer, initialSessionState, type SessionEvent } from './session-state-machine';
import { MAX_SESSION_DURATION_MS, type SessionState, type SessionPull } from './types';
import type { RunLiveSample } from './run-controller';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { Unsubscribe } from '@/shared/observable';
import type {
  IVehicleRepository, ICalibrationRepository, IRunRepository, ISampleRepository, IDerivedCurveRepository,
} from '@/api/repositories/types';
import type { Calibration, Vehicle, Sample, UUID } from '@/shared/types';
import type { RawSpeedSample } from '@/analysis/types';
import { analyzeRun } from '@/analysis/pipeline';
import { detectPulls, slicePullSamples, type PullDetectionConfig } from '@/analysis/pull-detection';
import { nowIso } from '@/shared/iso-time';
import { SensorRecorder, type SensorRecording } from '@/sensors/recording';

export interface SessionControllerOptions {
  sensor: SpeedSource;
  vehicleRepository: IVehicleRepository;
  calibrationRepository: ICalibrationRepository;
  runRepository: IRunRepository;
  sampleRepository: ISampleRepository;
  derivedCurveRepository: IDerivedCurveRepository;
  maxDurationMs?: number;
  detection?: Partial<PullDetectionConfig>;
  onStateChange: (state: SessionState) => void;
  onLiveSample?: (s: RunLiveSample) => void;
  onError?: (err: unknown) => void;
  onRecordingFinished?: (rec: SensorRecording) => void;
}

/**
 * Hands-free session: record the whole ride without touching the phone, then
 * detect the acceleration pulls afterwards and turn the selected ones into
 * runs. Unlike RunController there are no DB writes until the rider is back
 * and explicitly saves — a session that never gets saved costs nothing.
 */
export class SessionController {
  private state: SessionState = initialSessionState();
  private unsub: Unsubscribe | null = null;
  private samples: RawSpeedSample[] = [];
  private calibration: Calibration | null = null;
  private vehicle: Vehicle | null = null;
  private recorder: SensorRecorder | null = null;
  private sensorRunning = false;
  private finishing = false;
  private fixTimestamps: number[] = [];
  private readonly maxDurationMs: number;

  constructor(private readonly opts: SessionControllerOptions) {
    this.maxDurationMs = opts.maxDurationMs ?? MAX_SESSION_DURATION_MS;
  }

  getState(): SessionState {
    return this.state;
  }

  /** Sensor running, live samples flow to the UI, nothing buffered yet. */
  async warmup(vehicleId: string, calibrationId: string): Promise<void> {
    if (this.sensorRunning) return;
    const [cal, vehicle] = await Promise.all([
      this.opts.calibrationRepository.get(calibrationId),
      this.opts.vehicleRepository.get(vehicleId),
    ]);
    if (!cal) throw new Error(`calibration not found: ${calibrationId}`);
    if (!vehicle) throw new Error(`vehicle not found: ${vehicleId}`);
    this.calibration = cal;
    this.vehicle = vehicle;
    this.transition({
      type: 'READY',
      vehicle_id: vehicleId,
      calibration_id: cal.id,
      gear_label: cal.gear_label,
    });
    this.unsub = this.opts.sensor.samples$.subscribe((s) => this.onSample(s));
    await this.opts.sensor.start();
    this.sensorRunning = true;
  }

  /** Begin buffering the whole ride. Purely local — no run row is created. */
  start(): void {
    if (this.state.kind !== 'ready') throw new Error('start() requires ready state');
    this.samples = [];
    this.finishing = false;
    if (this.opts.onRecordingFinished) {
      this.recorder = new SensorRecorder();
      this.recorder.start(
        'run',
        {
          vehicle_id: this.state.vehicle_id,
          calibration_id: this.state.calibration_id,
          gear_label: this.state.gear_label,
          label: 'Hands-free session',
        },
        { motion: false },
      );
      this.recorder.attachGps(this.opts.sensor);
    }
    this.transition({ type: 'START' });
  }

  /** Stop the sensor, persist the raw recording, detect pulls in the buffer. */
  async finish(): Promise<void> {
    if (this.state.kind !== 'recording' || this.finishing) return;
    this.finishing = true;
    this.unsub?.();
    this.unsub = null;
    try { await this.opts.sensor.stop(); } catch { /* keep going — analysis is local */ }
    this.sensorRunning = false;
    if (this.recorder) {
      const rec = this.recorder.finish();
      this.recorder = null;
      if (rec) this.opts.onRecordingFinished?.(rec);
    }
    this.transition({ type: 'FINISH' });

    let pulls: SessionPull[] = [];
    try {
      pulls = this.buildPulls();
    } catch (err) {
      this.opts.onError?.(err);
    }
    this.transition({ type: 'PULLS_READY', pulls });
  }

  private buildPulls(): SessionPull[] {
    if (!this.vehicle || !this.calibration) throw new Error('no vehicle/calibration during detection');
    const vehicle = this.vehicle;
    const calibration = this.calibration;
    return detectPulls(this.samples, this.opts.detection).map((pull) => {
      const slice = slicePullSamples(this.samples, pull);
      let analysis: SessionPull['analysis'] = null;
      try {
        const result = analyzeRun({
          samples: slice,
          mass_kg: vehicle.mass_kg,
          rollout_m_per_rev: calibration.rollout_m_per_rev,
          kind: vehicle.kind,
          drag_coefficient: vehicle.drag_coefficient,
          frontal_area_m2: vehicle.frontal_area_m2,
        });
        if (result.points.length > 0) analysis = result;
      } catch { /* a slice the pipeline can't handle stays selectable-off */ }
      return { pull, samples: slice, analysis };
    });
  }

  /**
   * Persist the selected pulls as runs (run + samples + curve + peaks each).
   * Pulls without a usable analysis are skipped. Individual failures don't
   * abort the batch; if nothing could be saved the state returns to reviewing.
   */
  async saveSelected(indices: number[], notes = 'Hands-free session'): Promise<UUID[]> {
    if (this.state.kind !== 'reviewing') throw new Error('saveSelected() requires reviewing state');
    const { pulls, vehicle_id, calibration_id, gear_label } = this.state;
    const chosen = [...new Set(indices)].sort((a, b) => a - b)
      .map((i) => ({ i, sp: pulls[i] }))
      .filter(({ sp }) => sp && sp.analysis);
    this.transition({ type: 'SAVE_START' });

    const runIds: UUID[] = [];
    let firstError: unknown = null;
    for (const { i, sp } of chosen) {
      const analysis = sp.analysis!;
      let runId: UUID | null = null;
      try {
        const run = await this.opts.runRepository.create({
          vehicle_id,
          calibration_id,
          gear_label,
          conditions: {},
          notes: chosen.length > 1 ? `${notes} — pull ${i + 1}` : notes,
        });
        runId = run.id;
        const rows: Sample[] = sp.samples.map((s) => ({
          run_id: run.id,
          t_ms: Math.round(s.t_ms),
          speed_mps: s.speed_mps,
          accel_long_ms2: null,
          accel_vert_ms2: null,
          lat: null,
          lon: null,
          hdop: null,
          altitude_m: s.altitude_m ?? null,
        }));
        await this.opts.sampleRepository.insertMany(rows);
        await this.opts.derivedCurveRepository.upsert({
          run_id: run.id,
          rpm_min: analysis.rpm_min,
          rpm_max: analysis.rpm_max,
          points: analysis.points,
          pipeline_version: analysis.pipeline_version,
          computed_at: nowIso(),
        });
        const peakPower = analysis.points.reduce(
          (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
          analysis.points[0],
        );
        const peakTorque = analysis.points.reduce(
          (best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best),
          analysis.points[0],
        );
        await this.opts.runRepository.update(run.id, {
          peak_power_kw: peakPower.wheel_power_kw,
          peak_torque_nm: peakTorque.wheel_torque_nm,
          peak_power_rpm: peakPower.rpm,
        });
        // The run happened during the session, not at save time; end it a
        // pull-duration after the server-assigned start so it isn't 0-length.
        const endedAt = new Date(Date.parse(run.started_at) + sp.pull.duration_ms).toISOString();
        await this.opts.runRepository.finalize(run.id, endedAt);
        await this.opts.runRepository.markComplete(run.id);
        runIds.push(run.id);
      } catch (err) {
        firstError ??= err;
        if (runId) {
          try { await this.opts.runRepository.markDegraded(runId); } catch { /* best effort */ }
        }
      }
    }

    if (runIds.length === 0) {
      this.transition({ type: 'SAVE_FAILED' });
      if (firstError) this.opts.onError?.(firstError);
      else if (chosen.length === 0) this.opts.onError?.(new Error('no analyzable pulls selected'));
      return [];
    }
    if (firstError) this.opts.onError?.(firstError);
    this.transition({ type: 'SAVE_DONE', run_ids: runIds });
    return runIds;
  }

  /** Safe on unmount in any state; a still-open recording is still persisted. */
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

  private onSample(s: SensorSample<SpeedValue>): void {
    if (!this.calibration) return;

    this.fixTimestamps.push(s.t_ms);
    if (this.fixTimestamps.length > 10) this.fixTimestamps.shift();
    const span_ms = this.fixTimestamps.length > 1
      ? this.fixTimestamps[this.fixTimestamps.length - 1] - this.fixTimestamps[0]
      : 0;
    const fix_rate_hz = span_ms > 0 ? (this.fixTimestamps.length - 1) / (span_ms / 1000) : 0;

    const recording = this.state.kind === 'recording';

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

    this.samples.push({
      t_ms: s.t_ms,
      speed_mps: s.value.speed_mps,
      altitude_m: s.value.altitude_m ?? null,
    });

    const elapsed = s.t_ms - this.samples[0].t_ms;
    if (elapsed >= this.maxDurationMs) {
      void this.finish().catch((err) => this.opts.onError?.(err));
    }
  }

  private transition(event: SessionEvent): void {
    this.state = sessionReducer(this.state, event);
    this.opts.onStateChange(this.state);
  }
}
