import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signInMagicLink = vi.fn();

vi.mock('@/auth/auth-client', () => ({
  authClient: {
    signIn: {
      magicLink: (...args: unknown[]) => signInMagicLink(...args),
    },
  },
}));

import { LoginScreen } from '@/ui/auth/login-screen';

function mockTurnstile() {
  let renderedCallback: ((token: string) => void) | null = null;
  const reset = vi.fn();
  const remove = vi.fn();
  window.turnstile = {
    render: (_container, options) => {
      renderedCallback = options.callback;
      return 'widget-1';
    },
    reset,
    remove,
  };
  return {
    solve: async (token: string) => {
      await waitFor(() => expect(renderedCallback).not.toBeNull());
      act(() => renderedCallback!(token));
    },
    reset,
    remove,
  };
}

describe('LoginScreen', () => {
  beforeEach(() => {
    signInMagicLink.mockReset();
    delete (window as { turnstile?: unknown }).turnstile;
  });

  it('keeps submit disabled until the captcha resolves', async () => {
    const turnstile = mockTurnstile();
    render(<LoginScreen />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });

    const button = screen.getByRole('button', { name: /send magic link/i });
    expect(button).toBeDisabled();

    await turnstile.solve('test-token');

    await waitFor(() => expect(button).not.toBeDisabled());
    cleanup();
  });

  it('sends the captcha token as x-captcha-response and resets on error', async () => {
    const turnstile = mockTurnstile();
    signInMagicLink.mockResolvedValue({ error: { message: 'Captcha verification failed' } });
    render(<LoginScreen />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@example.com' },
    });
    await turnstile.solve('test-token');

    const button = screen.getByRole('button', { name: /send magic link/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => {
      expect(signInMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          fetchOptions: { headers: { 'x-captcha-response': 'test-token' } },
        }),
      );
    });

    await waitFor(() => expect(turnstile.reset).toHaveBeenCalledWith('widget-1'));
    expect(button).toBeDisabled();
    cleanup();
  });
});
