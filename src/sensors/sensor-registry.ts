import type { Capability, SensorSource, SpeedSource, RpmSource, AccelSource } from './types';

type AnySource = SensorSource<unknown>;

interface RegisteredSource {
  source: AnySource;
  priority: number;
}

type CapabilityMap = {
  speed: SpeedSource;
  rpm: RpmSource;
  accel: AccelSource;
  throttle: SensorSource<unknown>;
};

export class SensorRegistry {
  private readonly registered: RegisteredSource[] = [];

  register(source: AnySource, priority = 0): void {
    this.registered.push({ source, priority });
  }

  best<C extends Capability>(capability: C): CapabilityMap[C] | null {
    const candidates = this.registered
      .filter((r) => r.source.capabilities.includes(capability))
      .sort((a, b) => b.priority - a.priority);
    return (candidates[0]?.source as CapabilityMap[C] | undefined) ?? null;
  }
}
