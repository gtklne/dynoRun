import type { Database } from './database';
import { createWebDatabase } from './database-web';
import { isNative } from '@/app/platform';

export async function createDatabase(name: string): Promise<Database> {
  if (isNative()) {
    const { createCapacitorDatabase } = await import('./database-capacitor');
    return createCapacitorDatabase(name);
  }
  return createWebDatabase(name);
}
