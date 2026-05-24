import { createContext, useContext } from 'react';
import type { SpeedSource } from '@/sensors/types';
import { createSpeedSource } from '@/sensors/speed-source-factory';

export type SpeedSourceFactory = () => SpeedSource | Promise<SpeedSource>;

export const SpeedSourceContext = createContext<SpeedSourceFactory>(() => createSpeedSource());

export function useSpeedSourceFactory(): SpeedSourceFactory {
  return useContext(SpeedSourceContext);
}
