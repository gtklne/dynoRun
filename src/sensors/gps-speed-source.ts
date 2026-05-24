import type { Capability, SensorSample, SpeedSource, SpeedValue } from './types';
import { Subject } from '@/shared/observable';

export class GpsSpeedSource implements SpeedSource {
  readonly id = 'gps';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  private watchId: number | null = null;
  private startMs = 0;

  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation API not available in this environment');
    }
    this.startMs = performance.now();
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const speed = pos.coords.speed ?? 0;
        const t_ms = performance.now() - this.startMs;
        const quality = pos.coords.accuracy ? Math.max(0, 1 - pos.coords.accuracy / 30) : 0.5;
        this.samples$.next({ t_ms, value: { speed_mps: Math.max(0, speed) }, quality });
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }

  async stop(): Promise<void> {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
  }
}
