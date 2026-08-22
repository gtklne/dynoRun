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
  const { user, isAdmin, loading, signOut } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <span data-testid="email">{user?.email ?? 'anonymous'}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
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
