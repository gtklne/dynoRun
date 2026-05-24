import type { Capability, SensorSample, SpeedSource, SpeedValue } from './types';
import { Subject } from '@/shared/observable';
import { haversineDistance } from '@/shared/geo';

interface LastFix { lat: number; lng: number; ts: number; }

export class GpsSpeedSource implements SpeedSource {
  readonly id = 'gps';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  readonly errors$ = new Subject<GeolocationPositionError>();
  private watchId: number | null = null;
  private startMs = 0;
  private lastFix: LastFix | null = null;

  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation API not available in this environment');
    }
    this.startMs = performance.now();
    this.lastFix = null;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const t_ms = performance.now() - this.startMs;
        const quality = pos.coords.accuracy ? Math.max(0, 1 - pos.coords.accuracy / 30) : 0.5;

        let speed_mps = pos.coords.speed != null && pos.coords.speed > 0
          ? pos.coords.speed
          : this.computeSpeedFromDelta(pos.coords.latitude, pos.coords.longitude, pos.timestamp);

        speed_mps = Math.max(0, speed_mps);
        this.lastFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp };

        this.samples$.next({
          t_ms,
          value: {
            speed_mps,
            accuracy_m: pos.coords.accuracy ?? undefined,
            altitude_m: pos.coords.altitude ?? undefined,
            heading_deg: pos.coords.heading ?? undefined,
          },
          quality,
        });
      },
      (err) => this.errors$.next(err),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }

  async stop(): Promise<void> {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.lastFix = null;
  }

  private computeSpeedFromDelta(lat: number, lng: number, ts: number): number {
    if (!this.lastFix) return 0;
    const dt_s = (ts - this.lastFix.ts) / 1000;
    if (dt_s < 0.05) return 0;
    const d_m = haversineDistance(this.lastFix.lat, this.lastFix.lng, lat, lng);
    return d_m / dt_s;
  }
}
