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

export interface SpeedSource extends SensorSource<SpeedValue> {
  readonly rawPosition$?: Observable<GpsPosition>;
}
export type RpmSource = SensorSource<RpmValue>;
export type AccelSource = SensorSource<AccelValue>;
