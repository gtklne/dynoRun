import { describe, expect, it } from 'vitest';
import { fillDailySeries } from '@/shared/daily-series';

describe('fillDailySeries', () => {
  it('produces a dense window ending at today with zeros for missing days', () => {
    const out = fillDailySeries(
      [
        { day: '2026-07-01', count: 3 },
        { day: '2026-06-29', count: 1 },
      ],
      5,
      '2026-07-03',
    );
    expect(out).toEqual([
      { day: '2026-06-29', count: 1 },
      { day: '2026-06-30', count: 0 },
      { day: '2026-07-01', count: 3 },
      { day: '2026-07-02', count: 0 },
      { day: '2026-07-03', count: 0 },
    ]);
  });

  it('drops sparse entries older than the window', () => {
    const out = fillDailySeries([{ day: '2026-01-01', count: 9 }], 3, '2026-07-03');
    expect(out.map((d) => d.count)).toEqual([0, 0, 0]);
    expect(out[0].day).toBe('2026-07-01');
  });

  it('crosses month boundaries correctly', () => {
    const out = fillDailySeries([], 3, '2026-03-01');
    expect(out.map((d) => d.day)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });
});
