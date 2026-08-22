import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
const navigate = vi.fn();

vi.mock('@/auth/auth-client', () => ({
  authClient: {
    requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
    resetPassword: (...a: unknown[]) => resetPassword(...a),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import { ForgotPasswordScreen } from '@/ui/auth/forgot-password-screen';
import { ResetPasswordScreen } from '@/ui/auth/reset-password-screen';

function mockTurnstile() {
  let cb: ((token: string) => void) | null = null;
  const reset = vi.fn();
  window.turnstile = {
    render: (_c, options) => { cb = options.callback; return 'w1'; },
    reset,
    remove: vi.fn(),
  };
  return {
    solve: async (token: string) => {
      await waitFor(() => expect(cb).not.toBeNull());
      act(() => cb!(token));
    },
    reset,
  };
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    requestPasswordReset.mockReset().mockResolvedValue({ error: null });
    delete (window as { turnstile?: unknown }).turnstile;
  });
  afterEach(cleanup);

  it('requires a captcha and asks better-auth to redirect back to /reset-password', async () => {
    const turnstile = mockTurnstile();
    render(<ForgotPasswordScreen />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'user@example.com' },
    });

    const button = screen.getByRole('button', { name: /send reset link/i });
    // This endpoint mails an attacker-chosen address, so it must never be
    // reachable without a solved challenge.
    expect(button).toBeDisabled();

    await turnstile.solve('tok');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith({
        email: 'user@example.com',
        redirectTo: '/reset-password',
        fetchOptions: { headers: { 'x-captcha-response': 'tok' } },
      });
    });
  });

  it('confirms without revealing whether the address has an account', async () => {
    const turnstile = mockTurnstile();
    render(<ForgotPasswordScreen />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    await turnstile.solve('tok');
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    // "If an account exists" rather than "sent": the wording is what stops this
    // screen being an account-enumeration oracle.
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
  });
});

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    resetPassword.mockReset().mockResolvedValue({ error: null });
    navigate.mockReset();
  });
  afterEach(cleanup);

  function renderAt(search: string) {
    return render(
      <MemoryRouter initialEntries={[`/reset-password${search}`]}>
        <ResetPasswordScreen />
      </MemoryRouter>,
    );
  }

  it('shows the expired-link state when better-auth redirects with an error', () => {
    renderAt('?error=INVALID_TOKEN');
    expect(screen.getByText(/link expired/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it('shows the expired-link state when there is no token at all', () => {
    renderAt('');
    expect(screen.getByText(/link expired/i)).toBeInTheDocument();
  });

  it('refuses to submit when the two passwords differ', async () => {
    renderAt('?token=abc');

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'longenoughpw' } });
    fireEvent.change(screen.getByLabelText(/repeat password/i), { target: { value: 'differentpw1' } });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('submits the new password with the token from the URL', async () => {
    renderAt('?token=abc123');

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'longenoughpw' } });
    fireEvent.change(screen.getByLabelText(/repeat password/i), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({ newPassword: 'longenoughpw', token: 'abc123' });
    });
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
  });

  it('keeps the form up when the server rejects the reset', async () => {
    resetPassword.mockResolvedValue({ error: { message: 'Token expired' } });
    renderAt('?token=abc123');

    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'longenoughpw' } });
    fireEvent.change(screen.getByLabelText(/repeat password/i), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Token expired');
    expect(screen.queryByText(/password changed/i)).toBeNull();
  });
});
