import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const isNative = vi.fn();
vi.mock('@/app/platform', () => ({ isNative: () => isNative() }));

import { getNativeToken, setNativeToken, clearNativeToken } from '@/auth/native-token';

const KEY = 'dynorun.session_token';

describe('native session token store', () => {
  beforeEach(() => {
    localStorage.clear();
    isNative.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('never reads or writes a token on web', () => {
    isNative.mockReturnValue(false);
    setNativeToken('web-token');
    // Web sessions are HttpOnly cookies. A token in localStorage here would be
    // a second, script-readable copy of the session for no benefit.
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(getNativeToken()).toBeNull();
  });

  it('round-trips a token on native', () => {
    isNative.mockReturnValue(true);
    setNativeToken('native-token');
    expect(getNativeToken()).toBe('native-token');
  });

  it('clears the token even when called from web, so sign-out is thorough', () => {
    isNative.mockReturnValue(true);
    setNativeToken('native-token');
    isNative.mockReturnValue(false);
    clearNativeToken();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('degrades to no session rather than throwing when storage is unavailable', () => {
    isNative.mockReturnValue(true);
    const boom = () => { throw new Error('storage disabled'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });

    expect(() => setNativeToken('t')).not.toThrow();
    expect(getNativeToken()).toBeNull();
    expect(() => clearNativeToken()).not.toThrow();
  });
});
