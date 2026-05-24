import { createContext, useContext } from 'react';
import type { SpeedSource } from '@/sensors/types';
import { GpsSpeedSource } from '@/sensors/gps-speed-source';

export type SpeedSourceFactory = () => SpeedSource;

export const SpeedSourceContext = createContext<SpeedSourceFactory>(() => new GpsSpeedSource());

export function useSpeedSourceFactory(): SpeedSourceFactory {
  return useContext(SpeedSourceContext);
}
