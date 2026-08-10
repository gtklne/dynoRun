import { gripSessionRepository } from '@/api/repositories/grip-session-repository';
import type { GripSessionFull } from '@/api/repositories/types';

/**
 * A grip session's stored channels are 2-7 MB of jsonb, and a parsed copy retains
 * ~3.5 MB of channel arrays. Compare loads several at once and the rider toggles
 * laps, swaps the reference and walks back and forth to the analyzer, none of
 * which should re-download anything.
 *
 * Bounded, because an unbounded module-level Map is a leak with a large constant:
 * every session ever opened stayed retained, and because the key carried
 * `updated_at`, every debounced settings save added a *fresh* copy while the old
 * one was never freed: six round-trips retained ~21 MB of dead channel data,
 * which on mobile Safari is the difference between a working tab and a discarded
 * one. An LRU of 6 covers a full MAX_COMPARE_LAPS comparison plus the analyzer.
 */
const MAX_ENTRIES = 6;

/** Insertion-ordered, so the first key is the least recently used. */
const cache = new Map<string, GripSessionFull>();

const keyOf = (id: string, updatedAt?: string | null) => `${id}@${updatedAt ?? ''}`;

function touch(key: string, value: GripSessionFull): GripSessionFull {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
  return value;
}

/**
 * Fetch a session, reusing a cached copy when one matches. `updatedAt` comes from
 * the session list; when the caller does not have it yet, any cached copy of that
 * id is used rather than none: the old lookup was gated on `updatedAt` being
 * supplied, so the compare screen (which mounts before the list resolves) missed
 * every time and re-downloaded a payload it already held.
 */
export async function loadGripSession(id: string, updatedAt?: string | null): Promise<GripSessionFull | null> {
  const exact = cache.get(keyOf(id, updatedAt));
  if (exact) return touch(keyOf(id, updatedAt), exact);
  if (!updatedAt) {
    for (const [k, v] of cache) {
      if (k.startsWith(`${id}@`)) return touch(k, v);
    }
  }
  const full = await gripSessionRepository.get(id);
  if (!full) return null;
  // only ever one copy of a given session: a settings save must replace it,
  // not accumulate alongside it
  invalidateGripSession(id);
  return touch(keyOf(id, full.updated_at), full);
}

/** Drop a session from the cache: call after editing its label or settings. */
export function invalidateGripSession(id: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${id}@`)) cache.delete(key);
  }
}

export function clearGripSessionCache(): void {
  cache.clear();
}

/** Entry count: for tests and diagnostics. */
export function gripSessionCacheSize(): number {
  return cache.size;
}
