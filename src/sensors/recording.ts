import type { Unsubscribe } from '@/shared/observable';
import type { SpeedSource, GpsPosition } from './types';
import type { RawSpeedSample } from '@/analysis/types';
import { haversineDistance } from '@/shared/geo';

export interface RawGpsFix {
  t_ms: number;
  wall_ms: number;
  pos_ms: number | null;
  lat: number;
  lng: number;
  altitude_m: number | null;
  altitude_accuracy_m: number | null;
  accuracy_m: number | null;
  speed_native_mps: number | null;
  heading_deg: number | null;
}

export interface RawMotionFix {
  t_ms: number;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  grav_x: number | null;
  grav_y: number | null;
  grav_z: number | null;
  rot_alpha: number | null;
  rot_beta: number | null;
  rot_gamma: number | null;
  interval_ms: number | null;
}

export interface SensorRecordingMeta {
  vehicle_id?: string;
  calibration_id?: string;
  run_id?: string;
  gear_label?: string;
  user_rpm?: number;
  label?: string;
}

export interface SensorRecording {
  version: 1;
  kind: 'run' | 'calibration';
  recorded_at: string;
  duration_ms: number;
  meta: SensorRecordingMeta;
  gps_fixes: RawGpsFix[];
  motion_fixes: RawMotionFix[];
}

export class SensorRecorder {
  private rec: SensorRecording | null = null;
  private startMs = 0;
  private gpsUnsub: Unsubscribe | null = null;
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;

  /**
   * `motion: false` skips DeviceMotion capture — a multi-minute hands-free
   * session at ~60 Hz motion would balloon the envelope to tens of MB, and
   * the analysis pipeline only consumes GPS.
   */
  start(kind: 'run' | 'calibration', meta: SensorRecordingMeta = {}, opts: { motion?: boolean } = {}): void {
    this.startMs = performance.now();
    this.rec = {
      version: 1,
      kind,
      recorded_at: new Date().toISOString(),
      duration_ms: 0,
      meta,
      gps_fixes: [],
      motion_fixes: [],
    };
    if (opts.motion !== false) {
      this.motionHandler = (e) => this.recordMotion(e);
      window.addEventListener('devicemotion', this.motionHandler);
    }
  }

  attachGps(source: SpeedSource): void {
    if (!source.rawPosition$) return;
    this.gpsUnsub = source.rawPosition$.subscribe((p) => this.recordGps(p));
  }

  private recordGps(p: GpsPosition): void {
    if (!this.rec) return;
    this.rec.gps_fixes.push({
      t_ms: Math.round(performance.now() - this.startMs),
      wall_ms: Date.now(),
      pos_ms: p.pos_ms,
      lat: p.lat,
      lng: p.lng,
      altitude_m: p.altitude_m,
      altitude_accuracy_m: p.altitude_accuracy_m,
      accuracy_m: p.accuracy_m,
      speed_native_mps: p.speed_native_mps,
      heading_deg: p.heading_deg,
    });
  }

  private recordMotion(e: DeviceMotionEvent): void {
    if (!this.rec) return;
    const a = e.acceleration;
    const ag = e.accelerationIncludingGravity;
    const r = e.rotationRate;
    this.rec.motion_fixes.push({
      t_ms: Math.round(performance.now() - this.startMs),
      accel_x: a?.x ?? null,
      accel_y: a?.y ?? null,
      accel_z: a?.z ?? null,
      grav_x: ag?.x ?? null,
      grav_y: ag?.y ?? null,
      grav_z: ag?.z ?? null,
      rot_alpha: r?.alpha ?? null,
      rot_beta: r?.beta ?? null,
      rot_gamma: r?.gamma ?? null,
      interval_ms: e.interval ?? null,
    });
  }

  finish(metaPatch: SensorRecordingMeta = {}): SensorRecording | null {
    if (!this.rec) return null;
    this.rec.duration_ms = Math.round(performance.now() - this.startMs);
    this.rec.meta = { ...this.rec.meta, ...metaPatch };
    if (this.motionHandler) {
      window.removeEventListener('devicemotion', this.motionHandler);
      this.motionHandler = null;
    }
    this.gpsUnsub?.();
    this.gpsUnsub = null;
    const out = this.rec;
    this.rec = null;
    return out;
  }
}

export function describeRecording(r: SensorRecording): string {
  const date = new Date(r.recorded_at).toLocaleString();
  const dur = (r.duration_ms / 1000).toFixed(1);
  return `${r.kind} · ${date} · ${dur}s · ${r.gps_fixes.length} GPS · ${r.motion_fixes.length} motion`;
}

function speedFromDelta(prev: RawGpsFix, cur: RawGpsFix): number {
  const prevT = prev.pos_ms ?? prev.wall_ms;
  const curT = cur.pos_ms ?? cur.wall_ms;
  const dt_s = (curT - prevT) / 1000;
  if (dt_s < 0.05) return 0;
  return haversineDistance(prev.lat, prev.lng, cur.lat, cur.lng) / dt_s;
}

/**
 * Speed for a GPS fix, mirroring the live GpsSpeedSource derivation so a replayed
 * run reproduces the original samples: native speed when present, otherwise
 * haversine distance from the previous fix over the GPS time delta.
 */
export function fixSpeedMps(prev: RawGpsFix | null, cur: RawGpsFix): number {
  const speed_mps =
    cur.speed_native_mps != null && cur.speed_native_mps > 0
      ? cur.speed_native_mps
      : prev
        ? speedFromDelta(prev, cur)
        : 0;
  return Math.max(0, speed_mps);
}

/** GPS accuracy → 0–1 quality, matching the live source mapping. */
export function fixQuality(cur: RawGpsFix): number {
  return cur.accuracy_m != null ? Math.max(0, 1 - cur.accuracy_m / 30) : 0.5;
}

/** Convert stored GPS fixes into the speed samples analyzeRun consumes. */
export function recordingSpeedSamples(fixes: RawGpsFix[]): RawSpeedSample[] {
  return fixes.map((fix, i) => ({
    t_ms: fix.t_ms,
    speed_mps: fixSpeedMps(i > 0 ? fixes[i - 1] : null, fix),
    altitude_m: fix.altitude_m,
  }));
}

/** Structural validation for a parsed/uploaded recording envelope. */
export function isSensorRecording(value: unknown): value is SensorRecording {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    r.version === 1 &&
    (r.kind === 'run' || r.kind === 'calibration') &&
    typeof r.recorded_at === 'string' &&
    Array.isArray(r.gps_fixes) &&
    Array.isArray(r.motion_fixes)
  );
}
