import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const getSession = vi.fn();
const signOutFn = vi.fn();
const isNative = vi.fn();

vi.mock('@/app/platform', () => ({ isNative: () => isNative() }));
vi.mock('@/auth/auth-client', () => ({
  authClient: {
    getSession: () => getSession(),
    signOut: () => signOutFn(),
  },
}));

import { AuthProvider, useAuth } from '@/auth/auth-context';
import { getNativeToken, setNativeToken } from '@/auth/native-token';

function Probe() {
  const { user, isAdmin, loading, refresh, signOut } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <span data-testid="email">{user?.email ?? 'anonymous'}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
      <button onClick={() => { void refresh(); }}>refresh</button>
      <button onClick={() => { void signOut(); }}>sign out</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    getSession.mockReset();
    signOutFn.mockReset().mockResolvedValue(undefined);
    isNative.mockReset().mockReturnValue(false);
    localStorage.clear();
  });
  afterEach(cleanup);

  it('exposes the signed-in user and the admin flag', async () => {
    getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com', role: 'admin' } } });
    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByTestId('email')).toHaveTextContent('a@b.com');
    expect(screen.getByTestId('admin')).toHaveTextContent('true');
  });

  it('treats a failed session lookup as signed out rather than hanging', async () => {
    getSession.mockRejectedValue(new Error('offline'));
    render(<AuthProvider><Probe /></AuthProvider>);

    expect(await screen.findByTestId('email')).toHaveTextContent('anonymous');
  });

  it('picks up a session created after mount when refreshed', async () => {
    // A sign-in inside the app leaves this provider holding the pre-sign-in
    // answer, and RequireAuth then bounces the user back to /login.
    getSession.mockResolvedValueOnce({ data: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(await screen.findByTestId('email')).toHaveTextContent('anonymous');

    getSession.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'a@b.com' } } });
    await act(async () => { screen.getByRole('button', { name: 'refresh' }).click(); });

    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent('a@b.com'));
  });

  it('clears the native bearer token on sign out', async () => {
    // Without this the token outlives the session it belonged to: the server
    // cookie is cleared but localStorage still holds a valid bearer, so the
    // next launch silently signs the user back in and "sign out" is a lie.
    isNative.mockReturnValue(true);
    setNativeToken('signed.token');
    getSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } });
    render(<AuthProvider><Probe /></AuthProvider>);

    await screen.findByTestId('email');
    await act(async () => { screen.getByRole('button', { name: 'sign out' }).click(); });

    await waitFor(() => expect(signOutFn).toHaveBeenCalled());
    expect(getNativeToken()).toBeNull();
  });
});
