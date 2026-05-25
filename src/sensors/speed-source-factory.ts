import { isNative } from '@/app/platform';
import type { SpeedSource } from './types';
import { GpsSpeedSource } from './gps-speed-source';
import { getActiveReplay } from './replay-state';

export async function createSpeedSource(): Promise<SpeedSource> {
  const replay = getActiveReplay();
  if (replay) {
    const { RecordedSpeedSource } = await import('./recorded-speed-source');
    return new RecordedSpeedSource(replay);
  }
  if (isNative()) {
    const { CapacitorGpsSpeedSource } = await import('./gps-speed-source-capacitor');
    return new CapacitorGpsSpeedSource();
  }
  return new GpsSpeedSource();
}
