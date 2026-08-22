import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const signInEmail = vi.fn();
const signUpEmail = vi.fn();
const signInWithSocial = vi.fn();
const navigate = vi.fn();

vi.mock('@/auth/auth-client', () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => signInEmail(...args) },
    signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
  },
}));

vi.mock('@/auth/social-sign-in', async () => {
  const actual = await vi.importActual<typeof import('@/auth/social-sign-in')>(
    '@/auth/social-sign-in',
  );
  return {
    ...actual,
    signInWithSocial: (...args: unknown[]) => signInWithSocial(...args),
    // The native deep-link listener is a no-op on web; keep it inert so the
    // effect never reaches the Capacitor dynamic imports under jsdom.
    listenForNativeAuthCallback: async () => () => {},
  };
});

// Rendered only under import.meta.env.DEV, which vitest sets. It carries its
// own "Sign in" button and would make every submit-button query ambiguous.
vi.mock('@/ui/auth/dev-login-panel', () => ({ DevLoginPanel: () => null }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

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
  };
}

/** SocialButtons asks the server which providers are configured. */
function mockProviders(providers: string[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ providers }),
  })) as unknown as typeof fetch);
}

async function switchToSignUp() {
  fireEvent.click(screen.getByRole('button', { name: /create one/i }));
  await screen.findByRole('button', { name: /^create account$/i });
}

describe('LoginScreen', () => {
  beforeEach(() => {
    signInEmail.mockReset().mockResolvedValue({ error: null });
    signUpEmail.mockReset().mockResolvedValue({ error: null });
    signInWithSocial.mockReset().mockResolvedValue(undefined);
    navigate.mockReset();
    mockProviders([]);
    delete (window as { turnstile?: unknown }).turnstile;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('signs in with email and password without demanding a captcha', async () => {
    render(<LoginScreen />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'hunter2hunter2' },
    });

    const button = screen.getByRole('button', { name: /^sign in$/i });
    // Regression guard: the captcha lived on sign-in under magic links, and
    // putting it back would silently restore the friction this replaced.
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    await waitFor(() => {
      expect(signInEmail).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'hunter2hunter2',
      });
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/home', { replace: true }));
  });

  it('surfaces a rejected sign-in instead of navigating', async () => {
    signInEmail.mockResolvedValue({ error: { message: 'Invalid email or password' } });
    render(<LoginScreen />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'wrongpassword' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps sign-up disabled until the captcha resolves, then sends the token', async () => {
    const turnstile = mockTurnstile();
    render(<LoginScreen />, { wrapper: MemoryRouter });
    await switchToSignUp();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'longenoughpw' },
    });

    const button = screen.getByRole('button', { name: /^create account$/i });
    expect(button).toBeDisabled();

    await turnstile.solve('test-token');
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => {
      expect(signUpEmail).toHaveBeenCalledWith(expect.objectContaining({
        email: 'new@example.com',
        password: 'longenoughpw',
        fetchOptions: { headers: { 'x-captcha-response': 'test-token' } },
      }));
    });
  });

  it('resets the captcha when sign-up is rejected', async () => {
    const turnstile = mockTurnstile();
    signUpEmail.mockResolvedValue({ error: { message: 'Captcha verification failed' } });
    render(<LoginScreen />, { wrapper: MemoryRouter });
    await switchToSignUp();

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenoughpw' } });
    await turnstile.solve('test-token');

    const button = screen.getByRole('button', { name: /^create account$/i });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(turnstile.reset).toHaveBeenCalledWith('widget-1'));
    expect(button).toBeDisabled();
  });

  it('defaults the name to the local part of the email when left blank', async () => {
    const turnstile = mockTurnstile();
    render(<LoginScreen />, { wrapper: MemoryRouter });
    await switchToSignUp();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'johannes@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenoughpw' } });
    await turnstile.solve('t');
    fireEvent.click(screen.getByRole('button', { name: /^create account$/i }));

    await waitFor(() => {
      expect(signUpEmail).toHaveBeenCalledWith(expect.objectContaining({ name: 'johannes' }));
    });
  });

  it('keeps a protected deep link as the post-sign-in destination', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/runs/run-1/review' } }]}>
        <LoginScreen />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/runs/run-1/review', { replace: true });
    });
  });

  it('rejects an external post-sign-in destination', async () => {
    render(
      <MemoryRouter initialEntries={['/login?next=%2F%2Fevil.example']}>
        <LoginScreen />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'longenoughpw' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/home', { replace: true }));
  });

  it('renders only the social providers the server reports as configured', async () => {
    mockProviders(['google', 'discord']);
    render(<LoginScreen />, { wrapper: MemoryRouter });

    expect(await screen.findByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with discord/i })).toBeInTheDocument();
    // Apple is a built-in provider but is not configured here, and a button
    // for an unregistered provider dead-ends on an opaque OAuth error.
    expect(screen.queryByRole('button', { name: /sign in with apple/i })).toBeNull();
  });

  it('hides social sign-in entirely when no provider is configured', async () => {
    mockProviders([]);
    render(<LoginScreen />, { wrapper: MemoryRouter });

    await screen.findByRole('button', { name: /^sign in$/i });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /sign in with/i })).toBeNull();
    });
  });

  it('passes the deep-link destination through a social sign-in', async () => {
    mockProviders(['google']);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/grip' } }]}>
        <LoginScreen />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /sign in with google/i }));

    await waitFor(() => expect(signInWithSocial).toHaveBeenCalledWith('google', '/grip'));
  });

  it('reports a social sign-in that could not start', async () => {
    mockProviders(['google']);
    signInWithSocial.mockRejectedValue(new Error('Provider is not configured'));
    render(<LoginScreen />, { wrapper: MemoryRouter });

    fireEvent.click(await screen.findByRole('button', { name: /sign in with google/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider is not configured');
  });
});
