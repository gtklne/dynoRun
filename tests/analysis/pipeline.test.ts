import { describe, it, expect } from 'vitest';
import { analyzeRun } from '@/analysis/pipeline';

describe('analyzeRun', () => {
  it('produces a non-empty curve for a synthetic constant-acceleration run', () => {
    const samples = Array.from({ length: 201 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: 10 + i * 0.1,
    }));
    const result = analyzeRun({
      samples,
      mass_kg: 1000,
      rollout_m_per_rev: 0.5,
    });
    expect(result.points.length).toBeGreaterThan(0);
    for (let i = 1; i < result.points.length; i++) {
      expect(result.points[i].wheel_power_kw).toBeGreaterThanOrEqual(
        result.points[i - 1].wheel_power_kw - 0.5,
      );
    }
    expect(result.pipeline_version).toBe(1);
  });
});
