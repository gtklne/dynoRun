import { isNative } from '@/app/platform';
import type { SpeedSource } from './types';
import { GpsSpeedSource } from './gps-speed-source';

export async function createSpeedSource(): Promise<SpeedSource> {
  if (isNative()) {
    const { CapacitorGpsSpeedSource } = await import('./gps-speed-source-capacitor');
    return new CapacitorGpsSpeedSource();
  }
  return new GpsSpeedSource();
}
