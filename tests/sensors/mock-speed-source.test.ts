import { describe, it, expect, vi } from 'vitest';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import type { SensorSample, SpeedValue } from '@/sensors/types';

describe('MockSpeedSource', () => {
  it('emits scripted samples in order', async () => {
    vi.useFakeTimers();
    const src = new MockSpeedSource('mock', [
      { t_ms: 0, value: { speed_mps: 10 }, quality: 1 },
      { t_ms: 100, value: { speed_mps: 11 }, quality: 1 },
      { t_ms: 200, value: { speed_mps: 12 }, quality: 1 },
    ]);
    const received: SensorSample<SpeedValue>[] = [];
    src.samples$.subscribe((s) => received.push(s));
    await src.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(received.map((s) => s.value.speed_mps)).toEqual([10, 11, 12]);
    await src.stop();
    vi.useRealTimers();
  });

  it('respects stop() and does not emit afterwards', async () => {
    vi.useFakeTimers();
    const src = new MockSpeedSource('mock', [
      { t_ms: 0, value: { speed_mps: 10 }, quality: 1 },
      { t_ms: 200, value: { speed_mps: 11 }, quality: 1 },
    ]);
    const received: number[] = [];
    src.samples$.subscribe((s) => received.push(s.value.speed_mps));
    await src.start();
    await vi.advanceTimersByTimeAsync(50);
    await src.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(received).toEqual([10]);
    vi.useRealTimers();
  });
});
