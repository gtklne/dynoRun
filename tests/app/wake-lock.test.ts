import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WakeLock } from '@/app/wake-lock';

describe('WakeLock', () => {
  const realNavigator = globalThis.navigator;

  beforeEach(() => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    (globalThis.navigator as unknown) = { wakeLock: { request } };
    (globalThis as unknown as { __mockRequest: typeof request }).__mockRequest = request;
  });

  afterEach(() => {
    (globalThis.navigator as unknown) = realNavigator;
  });

  it('acquire() calls navigator.wakeLock.request("screen")', async () => {
    const wl = new WakeLock();
    await wl.acquire();
    expect(
      (globalThis as unknown as { __mockRequest: ReturnType<typeof vi.fn> }).__mockRequest,
    ).toHaveBeenCalledWith('screen');
    expect(wl.held).toBe(true);
  });

  it('release() releases the held lock', async () => {
    const wl = new WakeLock();
    await wl.acquire();
    await wl.release();
    expect(wl.held).toBe(false);
  });

  it('acquire() is a no-op if wakeLock API is unavailable', async () => {
    (globalThis.navigator as unknown) = {};
    const wl = new WakeLock();
    await wl.acquire();
    expect(wl.held).toBe(false);
    expect(wl.supported).toBe(false);
  });
});
