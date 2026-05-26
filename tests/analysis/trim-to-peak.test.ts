import { describe, it, expect } from 'vitest';
import { trimToAccelPhase } from '@/analysis/trim-to-peak';

describe('trimToAccelPhase', () => {
  it('returns empty for empty input', () => {
    expect(trimToAccelPhase([])).toEqual([]);
  });

  it('returns single sample unchanged', () => {
    const s = [{ t_ms: 0, speed_mps: 5 }];
    expect(trimToAccelPhase(s)).toEqual(s);
  });

  it('keeps the run up to peak speed and drops the coast-down', () => {
    const samples = [
      { t_ms: 0, speed_mps: 1 },
      { t_ms: 1000, speed_mps: 3 },
      { t_ms: 2000, speed_mps: 5 },
      { t_ms: 3000, speed_mps: 4 },
      { t_ms: 4000, speed_mps: 2 },
    ];
    expect(trimToAccelPhase(samples)).toEqual(samples.slice(0, 3));
  });

  it('keeps all samples when speed never decreases', () => {
    const samples = [
      { t_ms: 0, speed_mps: 1 },
      { t_ms: 1000, speed_mps: 2 },
      { t_ms: 2000, speed_mps: 3 },
    ];
    expect(trimToAccelPhase(samples)).toEqual(samples);
  });

  it('keeps the first peak when the same max appears multiple times', () => {
    const samples = [
      { t_ms: 0, speed_mps: 1 },
      { t_ms: 1000, speed_mps: 5 },
      { t_ms: 2000, speed_mps: 5 },
      { t_ms: 3000, speed_mps: 3 },
    ];
    expect(trimToAccelPhase(samples)).toEqual(samples.slice(0, 2));
  });
});
