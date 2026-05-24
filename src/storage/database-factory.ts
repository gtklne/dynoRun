import type { Database } from './database';
import { createWebDatabase } from './database-web';

export async function createDatabase(name: string): Promise<Database> {
  return createWebDatabase(name);
}
