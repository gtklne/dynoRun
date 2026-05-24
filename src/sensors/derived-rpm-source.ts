import type { RpmSource, SensorSample, SpeedSource, RpmValue, Capability } from './types';
import { Subject, type Unsubscribe } from '@/shared/observable';

export class DerivedRpmSource implements RpmSource {
  readonly capabilities: Capability[] = ['rpm'];
  readonly samples$ = new Subject<SensorSample<RpmValue>>();
  private unsubscribe: Unsubscribe | null = null;

  constructor(
    readonly id: string,
    private readonly speedSource: SpeedSource,
    private readonly rolloutMPerRev: number,
  ) {}

  async start(): Promise<void> {
    this.unsubscribe = this.speedSource.samples$.subscribe((s) => {
      const revPerSec = s.value.speed_mps / this.rolloutMPerRev;
      const rpm = revPerSec * 60;
      this.samples$.next({ t_ms: s.t_ms, value: { rpm }, quality: s.quality });
    });
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
