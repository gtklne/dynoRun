import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/api/client';

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not send a JSON content type on bodyless requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch<{ ok: boolean }>('/api/vehicles');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(init.credentials).toBe('include');
  });

  it('uses a server error message instead of displaying raw JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'rpm must be positive' }),
    }));

    await expect(apiFetch('/api/calibrations')).rejects.toEqual(
      expect.objectContaining({ status: 400, message: 'rpm must be positive' }),
    );
  });
});
