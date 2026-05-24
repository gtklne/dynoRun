import { describe, it, expect } from 'vitest';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import { DerivedRpmSource } from '@/sensors/derived-rpm-source';
import type { SensorSample, RpmValue } from '@/sensors/types';

describe('DerivedRpmSource', () => {
  it('emits rpm = speed_mps / rollout * 60', async () => {
    const rollout = 80 / 3.6 / 50;
    const speedSrc = new MockSpeedSource('mock-speed', [
      { t_ms: 0, value: { speed_mps: 0 }, quality: 1 },
      { t_ms: 50, value: { speed_mps: 80 / 3.6 }, quality: 1 },
      { t_ms: 100, value: { speed_mps: 100 / 3.6 }, quality: 1 },
    ]);
    const rpmSrc = new DerivedRpmSource('derived-rpm', speedSrc, rollout);
    const received: SensorSample<RpmValue>[] = [];
    rpmSrc.samples$.subscribe((s) => received.push(s));
    await rpmSrc.start();
    await speedSrc.start();
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toHaveLength(3);
    expect(received[0].value.rpm).toBe(0);
    expect(received[1].value.rpm).toBeCloseTo(3000, 1);
    expect(received[2].value.rpm).toBeCloseTo(3750, 1);
    await speedSrc.stop();
    await rpmSrc.stop();
  });
});
