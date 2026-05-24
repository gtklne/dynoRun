import type { Capability, SensorSource } from './types';

type AnySource = SensorSource<unknown>;

export class SensorRegistry {
  private readonly sources: AnySource[] = [];

  register(source: AnySource): void {
    this.sources.push(source);
  }

  best<T extends AnySource>(capability: Capability): T | null {
    return (this.sources.find((s) => s.capabilities.includes(capability)) as T | undefined) ?? null;
  }
}
