import { describe, it, expect } from 'vitest';
import { resample } from '@/analysis/resample';

describe('resample', () => {
  it('linearly interpolates onto fixed timebase', () => {
    const input = [
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 200, speed_mps: 2 },
      { t_ms: 400, speed_mps: 4 },
    ];
    const out = resample(input, 100);
    expect(out).toEqual([
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 100, speed_mps: 1 },
      { t_ms: 200, speed_mps: 2 },
      { t_ms: 300, speed_mps: 3 },
      { t_ms: 400, speed_mps: 4 },
    ]);
  });

  it('handles a single sample', () => {
    const out = resample([{ t_ms: 0, speed_mps: 5 }], 100);
    expect(out).toEqual([{ t_ms: 0, speed_mps: 5 }]);
  });

  it('returns empty for empty input', () => {
    expect(resample([], 100)).toEqual([]);
  });
});
