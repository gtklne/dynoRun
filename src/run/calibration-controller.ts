import { CalibrationStabilityDetector } from './calibration-stability-detector';
import { calibrationReducer, initialCalibrationState } from './calibration-state-machine';
import { DEFAULT_STABILITY_WINDOW, type CalibrationState, type StabilityWindow } from './types';
import type { SpeedSource, SensorSample, SpeedValue } from '@/sensors/types';
import type { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import type { Calibration } from '@/shared/types';
import type { Unsubscribe } from '@/shared/observable';

export interface CalibrationControllerOptions {
  vehicleId: string;
  speedSource: SpeedSource;
  calibrationRepository: CalibrationRepository;
  window?: StabilityWindow;
  onStateChange: (state: CalibrationState) => void;
}

export class CalibrationController {
  private state: CalibrationState = initialCalibrationState();
  private detector: CalibrationStabilityDetector;
  private unsub: Unsubscribe | null = null;
  private running = false;

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
