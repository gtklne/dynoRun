import type { Capability, GpsPosition, SensorSample, SpeedSource, SpeedValue } from './types';
import { Subject } from '@/shared/observable';
import { haversineDistance } from '@/shared/geo';
import type { RawMotionFix, SensorRecording } from './recording';

export class RecordedSpeedSource implements SpeedSource {
  readonly id = 'recorded';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  readonly rawPosition$ = new Subject<GpsPosition>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;
  private startMs = 0;

  constructor(private readonly recording: SensorRecording) {}

  async start(): Promise<void> {
    this.running = true;
    this.startMs = performance.now();

    for (let i = 0; i < this.recording.gps_fixes.length; i++) {
      const fix = this.recording.gps_fixes[i];
      const prev = i > 0 ? this.recording.gps_fixes[i - 1] : null;
      const t = setTimeout(() => this.emitGps(fix, prev), Math.max(0, fix.t_ms));
      this.timers.push(t);
    }

    for (const m of this.recording.motion_fixes) {
      const t = setTimeout(() => this.dispatchMotion(m), Math.max(0, m.t_ms));
      this.timers.push(t);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private emitGps(
    fix: SensorRecording['gps_fixes'][number],
    prev: SensorRecording['gps_fixes'][number] | null,
  ): void {
    if (!this.running) return;
    const t_ms = Math.round(performance.now() - this.startMs);

    let speed_mps = fix.speed_native_mps != null && fix.speed_native_mps > 0
      ? fix.speed_native_mps
      : prev
        ? this.computeFromDelta(prev, fix)
        : 0;
    speed_mps = Math.max(0, speed_mps);

    const quality = fix.accuracy_m != null ? Math.max(0, 1 - fix.accuracy_m / 30) : 0.5;

    this.samples$.next({
      t_ms,
      value: {
        speed_mps,
        accuracy_m: fix.accuracy_m ?? undefined,
        altitude_m: fix.altitude_m ?? undefined,
        heading_deg: fix.heading_deg ?? undefined,
      },
      quality,
    });

    this.rawPosition$.next({
      lat: fix.lat,
      lng: fix.lng,
      altitude_m: fix.altitude_m,
      altitude_accuracy_m: fix.altitude_accuracy_m,
      accuracy_m: fix.accuracy_m,
      speed_native_mps: fix.speed_native_mps,
      heading_deg: fix.heading_deg,
      pos_ms: fix.pos_ms,
    });
  }

  private computeFromDelta(
    prev: SensorRecording['gps_fixes'][number],
    cur: SensorRecording['gps_fixes'][number],
  ): number {
    const prevT = prev.pos_ms ?? prev.wall_ms;
    const curT = cur.pos_ms ?? cur.wall_ms;
    const dt_s = (curT - prevT) / 1000;
    if (dt_s < 0.05) return 0;
    return haversineDistance(prev.lat, prev.lng, cur.lat, cur.lng) / dt_s;
  }

  private dispatchMotion(m: RawMotionFix): void {
    if (!this.running) return;
    try {
      const ev = new DeviceMotionEvent('devicemotion', {
        acceleration: { x: m.accel_x, y: m.accel_y, z: m.accel_z },
        accelerationIncludingGravity: { x: m.grav_x, y: m.grav_y, z: m.grav_z },
        rotationRate: { alpha: m.rot_alpha, beta: m.rot_beta, gamma: m.rot_gamma },
        interval: m.interval_ms ?? 16,
      });
      window.dispatchEvent(ev);
    } catch {
      // Some platforms restrict DeviceMotionEvent construction; fall back to a CustomEvent
      // carrying the same shape so any listener using addEventListener('devicemotion', …)
      // still gets the data.
      const ev = new CustomEvent('devicemotion', {
        detail: {
          acceleration: { x: m.accel_x, y: m.accel_y, z: m.accel_z },
          accelerationIncludingGravity: { x: m.grav_x, y: m.grav_y, z: m.grav_z },
          rotationRate: { alpha: m.rot_alpha, beta: m.rot_beta, gamma: m.rot_gamma },
          interval: m.interval_ms ?? 16,
        },
      });
      window.dispatchEvent(ev);
    }
  }
}
