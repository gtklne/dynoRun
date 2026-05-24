import { describe, it, expect, afterEach } from 'vitest';
import { isNative, getPlatform } from '@/app/platform';

describe('platform', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).Capacitor;
  });

  it('returns "web" when Capacitor is absent', () => {
    expect(getPlatform()).toBe('web');
    expect(isNative()).toBe(false);
  });

  it('returns the Capacitor platform when present', () => {
    (globalThis as Record<string, unknown>).Capacitor = { getPlatform: () => 'ios' };
    expect(getPlatform()).toBe('ios');
    expect(isNative()).toBe(true);
  });

  it('treats "android" as native', () => {
    (globalThis as Record<string, unknown>).Capacitor = { getPlatform: () => 'android' };
    expect(isNative()).toBe(true);
  });
});
