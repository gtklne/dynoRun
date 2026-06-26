import { describe, it, expect } from 'vitest';
import { analyzeRun } from '@/analysis/pipeline';
import { PIPELINE_VERSION } from '@/analysis/types';

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
    expect(result.pipeline_version).toBe(PIPELINE_VERSION);
    expect(result.accel_times.peak_speed_kmh).toBeGreaterThan(result.accel_times.start_speed_kmh);
    expect(result.quality.sample_count).toBeGreaterThan(0);
    expect(result.quality.rating).toBe('good');
  });

  it('carries a road-load breakdown parallel to the curve, with grade source', () => {
    const samples = Array.from({ length: 201 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: 10 + i * 0.1,
    }));
    const result = analyzeRun({ samples, mass_kg: 1234, rollout_m_per_rev: 0.5 });

    // breakdown aligns 1:1 with points (same bins) and reconciles with the total.
    expect(result.breakdown.length).toBe(result.points.length);
    result.breakdown.forEach((b, i) => {
      expect(b.rpm).toBe(result.points[i].rpm);
      expect(b.total_kw).toBeCloseTo(result.points[i].wheel_power_kw, 6);
    });

    // No altitude on these samples → grade unavailable, defaults applied.
    expect(result.road_load.grade_source).toBe('unavailable');
    expect(result.road_load.grade_rad).toBe(0);
    expect(result.road_load.mass_kg).toBe(1234);
    expect(result.road_load.cd_a_source).toBe('default');
  });

  it("reports grade_source 'gps' and vehicle CdA when altitude + aero are supplied", () => {
    const samples = Array.from({ length: 201 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: 10 + i * 0.1,
      altitude_m: 100 + i * 0.2, // gentle, plausible climb
    }));
    const result = analyzeRun({
      samples,
      mass_kg: 1000,
      rollout_m_per_rev: 0.5,
      kind: 'car',
      drag_coefficient: 0.30,
      frontal_area_m2: 2.2,
    });
    expect(result.road_load.grade_source).toBe('gps');
    expect(result.road_load.cd_a_source).toBe('vehicle');
    expect(result.road_load.cd_a_m2).toBeCloseTo(0.66, 6);
  });
});
