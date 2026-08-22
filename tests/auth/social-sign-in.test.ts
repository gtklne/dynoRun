import { describe, it, expect, beforeEach, vi } from 'vitest';

const isNative = vi.fn();
const signInSocial = vi.fn();
const verifyOneTimeToken = vi.fn();
const browserOpen = vi.fn();
const browserClose = vi.fn();
let urlOpenHandler: ((event: { url: string }) => void | Promise<void>) | null = null;
const removeListener = vi.fn();

vi.mock('@/app/platform', () => ({ isNative: () => isNative() }));
vi.mock('@/auth/auth-client', () => ({
  authClient: {
    signIn: { social: (...a: unknown[]) => signInSocial(...a) },
    oneTimeToken: { verify: (...a: unknown[]) => verifyOneTimeToken(...a) },
  },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: { open: (...a: unknown[]) => browserOpen(...a), close: () => browserClose() },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (_event: string, handler: (e: { url: string }) => void) => {
      urlOpenHandler = handler;
      return { remove: removeListener };
    },
  },
}));

import {
  signInWithSocial,
  listenForNativeAuthCallback,
  NATIVE_CALLBACK_URL,
} from '@/auth/social-sign-in';

describe('signInWithSocial', () => {
  beforeEach(() => {
    isNative.mockReset();
    signInSocial.mockReset().mockResolvedValue({ error: null, data: { url: 'https://accounts.google.com/o/oauth2/auth?x=1' } });
    browserOpen.mockReset();
  });

  it('lets the browser follow the redirect on web', async () => {
    isNative.mockReturnValue(false);
    await signInWithSocial('google', '/grip');

    expect(signInSocial).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/grip' });
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('opens the system browser on native instead of redirecting the webview', async () => {
    isNative.mockReturnValue(true);
    await signInWithSocial('google', '/grip');

    // disableRedirect is what makes better-auth hand back the authorize URL.
    // Without it the webview would follow the redirect itself and the OAuth
    // provider would refuse to render inside an embedded webview.
    expect(signInSocial).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      disableRedirect: true,
      callbackURL: expect.stringContaining('/native-callback'),
    }));
    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://accounts.google.com/o/oauth2/auth?x=1' });
  });

  it('fails loudly when the provider returns no URL', async () => {
    isNative.mockReturnValue(true);
    signInSocial.mockResolvedValue({ error: null, data: {} });

    await expect(signInWithSocial('discord', '/home')).rejects.toThrow(/did not return a URL/i);
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('propagates a provider error', async () => {
    isNative.mockReturnValue(false);
    signInSocial.mockResolvedValue({ error: { message: 'Provider not configured' } });

    await expect(signInWithSocial('apple', '/home')).rejects.toThrow('Provider not configured');
  });
});

describe('listenForNativeAuthCallback', () => {
  beforeEach(() => {
    isNative.mockReset();
    verifyOneTimeToken.mockReset().mockResolvedValue({ error: null, data: { session: {} } });
    browserClose.mockReset().mockResolvedValue(undefined);
    removeListener.mockReset();
    urlOpenHandler = null;
  });

  it('registers nothing on web', async () => {
    isNative.mockReturnValue(false);
    await listenForNativeAuthCallback(vi.fn(), vi.fn());
    expect(urlOpenHandler).toBeNull();
  });

  it('trades the one-time token for a session and signals success', async () => {
    isNative.mockReturnValue(true);
    const onSignedIn = vi.fn();
    const onError = vi.fn();
    await listenForNativeAuthCallback(onSignedIn, onError);

    await urlOpenHandler!({ url: `${NATIVE_CALLBACK_URL}?token=abc123` });

    expect(verifyOneTimeToken).toHaveBeenCalledWith({ token: 'abc123' });
    expect(browserClose).toHaveBeenCalled();
    expect(onSignedIn).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores deep links that are not the auth callback', async () => {
    isNative.mockReturnValue(true);
    const onSignedIn = vi.fn();
    await listenForNativeAuthCallback(onSignedIn, vi.fn());

    await urlOpenHandler!({ url: 'com.dynorun.app://share/run-7' });

    expect(verifyOneTimeToken).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('reports the error the callback page passed back', async () => {
    isNative.mockReturnValue(true);
    const onError = vi.fn();
    await listenForNativeAuthCallback(vi.fn(), onError);

    await urlOpenHandler!({ url: `${NATIVE_CALLBACK_URL}?error=Handoff%20failed%20(401)` });

    expect(verifyOneTimeToken).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Handoff failed (401)');
  });

  it('reports a token that was already spent', async () => {
    isNative.mockReturnValue(true);
    verifyOneTimeToken.mockResolvedValue({ error: { message: 'Invalid token' }, data: null });
    const onError = vi.fn();
    const onSignedIn = vi.fn();
    await listenForNativeAuthCallback(onSignedIn, onError);

    await urlOpenHandler!({ url: `${NATIVE_CALLBACK_URL}?token=spent` });

    expect(onError).toHaveBeenCalledWith('Invalid token');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('still finishes when the OS already dismissed the browser sheet', async () => {
    isNative.mockReturnValue(true);
    browserClose.mockRejectedValue(new Error('no browser open'));
    const onSignedIn = vi.fn();
    await listenForNativeAuthCallback(onSignedIn, vi.fn());

    await urlOpenHandler!({ url: `${NATIVE_CALLBACK_URL}?token=abc` });

    expect(onSignedIn).toHaveBeenCalled();
  });
});
