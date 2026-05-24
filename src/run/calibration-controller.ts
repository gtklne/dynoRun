import { CalibrationStabilityDetector } from './calibration-stability-detector';
import { calibrationReducer, initialCalibrationState } from './calibration-state-machine';
import { DEFAULT_STABILITY_WINDOW, type CalibrationState, type StabilityWindow } from './types';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { ICalibrationRepository } from '@/api/repositories/types';
import type { Calibration } from '@/shared/types';
import type { Unsubscribe } from '@/shared/observable';

export interface CalibrationLiveSample {
  t_ms: number;
  speed_kmh: number;
  quality: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  heading_deg: number | null;
  fix_rate_hz: number;
  stability: {
    elapsed_ms: number;
    speed_delta_kmh: number;
    window_ms: number;
    max_delta_kmh: number;
  };
}

export interface CalibrationControllerOptions {
  vehicleId: string;
  speedSource: SpeedSource;
  calibrationRepository: ICalibrationRepository;
  window?: StabilityWindow;
  onStateChange: (state: CalibrationState) => void;
  onLiveSample?: (sample: CalibrationLiveSample) => void;
}

export class CalibrationController {
  private state: CalibrationState = initialCalibrationState();
  private detector: CalibrationStabilityDetector;
  private unsub: Unsubscribe | null = null;
  private running = false;
  private fixTimestamps: number[] = [];

  constructor(private readonly opts: CalibrationControllerOptions) {
    this.detector = new CalibrationStabilityDetector(opts.window ?? DEFAULT_STABILITY_WINDOW);
  }

  getState(): CalibrationState {
    return this.state;
  }

  async start(input: { gear_label: string; user_rpm: number }): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.detector.reset();
    this.transition({ type: 'START', gear_label: input.gear_label, user_rpm: input.user_rpm, now_ms: 0 });
    this.unsub = this.opts.speedSource.samples$.subscribe((s) => this.onSample(s));
    await this.opts.speedSource.start();
  }

  async stop(): Promise<void> {
    this.unsub?.();
    this.unsub = null;
    await this.opts.speedSource.stop();
    this.running = false;
  }

  async confirm(): Promise<Calibration> {
    if (this.state.kind !== 'stable') {
      throw new Error('confirm() requires stable state');
    }
    const { gear_label, user_rpm, captured_speed_kmh } = this.state;
    const cal = await this.opts.calibrationRepository.create({
      vehicle_id: this.opts.vehicleId,
      gear_label,
      rpm: user_rpm,
      speed_kmh: captured_speed_kmh,
      notes: '',
    });
    this.transition({ type: 'CONFIRM', calibration_id: cal.id });
    return cal;
  }

  restart(): void {
    this.detector.reset();
    this.transition({ type: 'RESTART' });
  }

  private onSample(sample: SensorSample<SpeedValue>): void {
    this.detector.push({ t_ms: sample.t_ms, speed_mps: sample.value.speed_mps });

    this.fixTimestamps.push(sample.t_ms);
    if (this.fixTimestamps.length > 10) this.fixTimestamps.shift();

    if (this.opts.onLiveSample) {
      const window = this.opts.window ?? DEFAULT_STABILITY_WINDOW;
      const { elapsed_ms, speed_delta_kmh } = this.detector.progress(sample.t_ms);
      const span_ms = this.fixTimestamps.length > 1
        ? this.fixTimestamps[this.fixTimestamps.length - 1] - this.fixTimestamps[0]
        : 0;
      const fix_rate_hz = span_ms > 0 ? (this.fixTimestamps.length - 1) / (span_ms / 1000) : 0;
      this.opts.onLiveSample({
        t_ms: sample.t_ms,
        speed_kmh: sample.value.speed_mps * 3.6,
        quality: sample.quality,
        accuracy_m: sample.value.accuracy_m ?? null,
        altitude_m: sample.value.altitude_m ?? null,
        heading_deg: sample.value.heading_deg ?? null,
        fix_rate_hz,
        stability: { elapsed_ms, speed_delta_kmh, window_ms: window.duration_ms, max_delta_kmh: window.max_speed_delta_kmh },
      });
    }

    if (this.state.kind !== 'measuring') return;
    const stable = this.detector.check(sample.t_ms);
    if (stable) {
      this.transition({ type: 'STABILITY_DETECTED', captured_speed_kmh: stable.captured_speed_kmh });
    }
  }

  private transition(event: Parameters<typeof calibrationReducer>[1]): void {
    this.state = calibrationReducer(this.state, event);
    this.opts.onStateChange(this.state);
  }
}
