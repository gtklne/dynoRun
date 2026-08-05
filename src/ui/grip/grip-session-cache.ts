import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import type { GripSessionFull } from '@/api/repositories/types';

/**
 * A grip session's stored channels are 2–7 MB of jsonb. Compare loads several at
 * once and the rider toggles laps, swaps the reference and walks back and forth
 * to the analyzer — none of which should re-download anything. Keyed on
 * updated_at so a session edited elsewhere still refetches.
 */
const cache = new Map<string, GripSessionFull>();

export async function loadGripSession(id: string, updatedAt?: string): Promise<GripSessionFull | null> {
  if (updatedAt) {
    const hit = cache.get(`${id}:${updatedAt}`);
    if (hit) return hit;
  }
  const full = await gripSessionRepository.get(id);
  if (full) {
    cache.set(`${id}:${full.updated_at}`, full);
    // an unkeyed lookup should still hit after the first load
    cache.set(`${id}:`, full);
  }
  return full;
}

/** Drop a session from the cache — call after editing its label or settings. */
export function invalidateGripSession(id: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${id}:`)) cache.delete(key);
  }
}

export function clearGripSessionCache(): void {
  cache.clear();
}
