import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensureGeolocation } from '@/app/geolocation-permission';

describe('ensureGeolocation', () => {
  const realNavigator = globalThis.navigator;

  afterEach(() => {
    (globalThis.navigator as unknown) = realNavigator;
  });

  it('returns "granted" when query returns granted', async () => {
    (globalThis.navigator as unknown) = {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'granted' }) },
      geolocation: {},
    };
    const r = await ensureGeolocation();
    expect(r).toBe('granted');
  });

  it('returns "prompt" when state is prompt', async () => {
    (globalThis.navigator as unknown) = {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) },
      geolocation: {},
    };
    expect(await ensureGeolocation()).toBe('prompt');
  });

  it('returns "denied" when state is denied', async () => {
    (globalThis.navigator as unknown) = {
      permissions: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
      geolocation: {},
    };
    expect(await ensureGeolocation()).toBe('denied');
  });

  it('returns "unsupported" when geolocation API is missing', async () => {
    (globalThis.navigator as unknown) = {};
    expect(await ensureGeolocation()).toBe('unsupported');
  });

  it('falls back to "prompt" when permissions API is missing but geolocation exists', async () => {
    (globalThis.navigator as unknown) = { geolocation: {} };
    expect(await ensureGeolocation()).toBe('prompt');
  });
});
