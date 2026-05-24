import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '@/shared/uuid';

const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a v4 UUID when crypto.randomUUID is available', () => {
    expect(newId()).toMatch(V4_RE);
  });

  it('falls back to crypto.getRandomValues when randomUUID is missing (insecure context)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
    });
    const id = newId();
    expect(id).toMatch(V4_RE);
  });

  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
});
