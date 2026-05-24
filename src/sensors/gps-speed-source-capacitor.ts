import { Geolocation, type PositionOptions } from '@capacitor/geolocation';
import type { Capability, SensorSample, SpeedSource, SpeedValue } from './types';
import { Subject } from '@/shared/observable';

export class CapacitorGpsSpeedSource implements SpeedSource {
  readonly id = 'gps-capacitor';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  readonly errors$ = new Subject<{ message: string }>();
  private watchId: string | null = null;
  private startMs = 0;

  async start(): Promise<void> {
    const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (perm.location === 'denied') {
      this.errors$.next({ message: 'Location permission denied' });
      throw new Error('Location permission denied');
    }
    this.startMs = performance.now();
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 };
    this.watchId = await Geolocation.watchPosition(options, (pos, err) => {
      if (err) {
        this.errors$.next({ message: (err as Error).message });
        return;
      }
      if (!pos) return;
      const speed = pos.coords.speed ?? 0;
      const t_ms = performance.now() - this.startMs;
      const quality = pos.coords.accuracy ? Math.max(0, 1 - pos.coords.accuracy / 30) : 0.5;
      this.samples$.next({
        t_ms,
        value: {
          speed_mps: Math.max(0, speed),
          accuracy_m: pos.coords.accuracy ?? undefined,
          altitude_m: pos.coords.altitude ?? undefined,
          heading_deg: pos.coords.heading ?? undefined,
        },
        quality,
      });
    });
  }

  async stop(): Promise<void> {
    if (this.watchId !== null) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }
  }
}
