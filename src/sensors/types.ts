import type { Observable } from '@/shared/observable';

export type Capability = 'speed' | 'rpm' | 'accel' | 'throttle';

export interface SensorSample<T> {
  t_ms: number;
  value: T;
  quality: number;
}

export interface SpeedValue {
  speed_mps: number;
  accuracy_m?: number;
  altitude_m?: number;
  heading_deg?: number;
}
export interface RpmValue { rpm: number; }
export interface AccelValue { ax: number; ay: number; az: number; }

export interface GpsPosition {
  lat: number;
  lng: number;
  altitude_m: number | null;
  altitude_accuracy_m: number | null;
  accuracy_m: number | null;
  speed_native_mps: number | null;
  heading_deg: number | null;
  pos_ms: number | null;
}

export interface SensorSource<T> {
  readonly id: string;
  readonly capabilities: Capability[];
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly samples$: Observable<SensorSample<T>>;
}

/**
 * A sensor-level failure worth telling the rider about. Flattened to a plain
 * message because the browser source reports a GeolocationPositionError and the
 * Capacitor one a bare object, and nothing downstream needs to tell them apart.
 */
export interface SensorError {
  message: string;
}

export interface SpeedSource extends SensorSource<SpeedValue> {
  readonly rawPosition$?: Observable<GpsPosition>;
  /**
   * Optional because recorded/mock sources cannot fail this way. Load-bearing
   * for hands-free recording: with the phone in a pocket, a revoked permission
   * or a dead fix is otherwise indistinguishable from a quiet ride.
   */
  readonly errors$?: Observable<SensorError>;
}
export type RpmSource = SensorSource<RpmValue>;
export type AccelSource = SensorSource<AccelValue>;
