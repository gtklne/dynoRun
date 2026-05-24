import type { SensorSample, SpeedSource, SpeedValue, Capability } from './types';
import { Subject } from '@/shared/observable';

export class MockSpeedSource implements SpeedSource {
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;

  constructor(
    readonly id: string,
    private readonly script: SensorSample<SpeedValue>[],
  ) {}

  async start(): Promise<void> {
    this.running = true;
    for (const sample of this.script) {
      const t = setTimeout(() => {
        if (this.running) this.samples$.next(sample);
      }, sample.t_ms);
      this.timers.push(t);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
