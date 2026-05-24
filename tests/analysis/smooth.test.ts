import { describe, it, expect } from 'vitest';
import { smoothSavitzkyGolay } from '@/analysis/smooth';

describe('smoothSavitzkyGolay', () => {
  it('passes a straight line through unchanged', () => {
    const input = Array.from({ length: 20 }, (_, i) => ({ t_ms: i * 100, speed_mps: i }));
    const out = smoothSavitzkyGolay(input, 5);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].speed_mps).toBeCloseTo(i, 6);
    }
  });

  it('attenuates a single-sample spike', () => {
    const input = Array.from({ length: 11 }, (_, i) => ({ t_ms: i * 100, speed_mps: i === 5 ? 10 : 0 }));
    const out = smoothSavitzkyGolay(input, 5);
    expect(out[5].speed_mps).toBeLessThan(10);
    expect(out[5].speed_mps).toBeGreaterThan(0);
  });

  it('returns input unchanged if window is too large for series', () => {
    const input = [
      { t_ms: 0, speed_mps: 1 },
      { t_ms: 100, speed_mps: 2 },
    ];
    expect(smoothSavitzkyGolay(input, 5)).toEqual(input);
  });
});
