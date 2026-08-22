import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const isNative = vi.fn();
vi.mock('@/app/platform', () => ({ isNative: () => isNative() }));

import { apiFetch } from '@/api/client';
import { setNativeToken, clearNativeToken } from '@/auth/native-token';

function mockFetch(status = 200, body: unknown = {}) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', spy as unknown as typeof fetch);
  return spy;
}

function initOf(spy: ReturnType<typeof mockFetch>): RequestInit {
  const init = spy.mock.calls[0]?.[1];
  if (!init) throw new Error('fetch was not called');
  return init;
}

function headersOf(spy: ReturnType<typeof mockFetch>): Headers {
  return new Headers(initOf(spy).headers);
}

describe('apiFetch native bearer token', () => {
  beforeEach(() => {
    isNative.mockReset();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends Authorization on native', async () => {
    // The bug this pins: the bearer wiring existed only on the better-auth
    // client, so getSession succeeded and RequireAuth passed, then every data
    // request 401d and bounced back to /login. Sign-in "worked" and the app
    // was an infinite redirect loop.
    isNative.mockReturnValue(true);
    setNativeToken('signed.token');
    const spy = mockFetch();

    await apiFetch('/api/vehicles');

    expect(headersOf(spy).get('Authorization')).toBe('Bearer signed.token');
  });

  it('sends no Authorization on web, where the cookie is the session', async () => {
    isNative.mockReturnValue(false);
    const spy = mockFetch();

    await apiFetch('/api/vehicles');

    expect(headersOf(spy).get('Authorization')).toBeNull();
    expect(initOf(spy).credentials).toBe('include');
  });

  it('sends no Authorization on native once the token is cleared', async () => {
    isNative.mockReturnValue(true);
    setNativeToken('signed.token');
    clearNativeToken();
    const spy = mockFetch();

    await apiFetch('/api/vehicles');

    expect(headersOf(spy).get('Authorization')).toBeNull();
  });

  it('keeps sending the token on write requests alongside the JSON content type', async () => {
    isNative.mockReturnValue(true);
    setNativeToken('signed.token');
    const spy = mockFetch();

    await apiFetch('/api/vehicles', { method: 'POST', body: JSON.stringify({ name: 'x' }) });

    const headers = headersOf(spy);
    expect(headers.get('Authorization')).toBe('Bearer signed.token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
