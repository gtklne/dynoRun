import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useGripPlayback } from '@/ui/grip/use-grip-playback';

it('plays recorded time, holds through gaps, scrubs by seconds and stops at the end', () => {
  let tick: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { tick = cb; return 1; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const t = [10, 10.1, 10.2, 11.2, 11.3];
  const { result, unmount } = renderHook(() => useGripPlayback(t.length, 'lap1', t));
  act(() => result.current.toggle());
  act(() => tick(0));
  act(() => tick(500));
  expect(result.current.cursor).toBe(2);
  act(() => tick(1250));
  expect(result.current.cursor).toBe(3);
  act(() => tick(1500));
  expect(result.current.cursor).toBe(4); expect(result.current.playing).toBe(false);
  act(() => result.current.scrubSeconds(.15));
  expect(result.current.cursor).toBe(1);
  unmount(); vi.unstubAllGlobals();
});
