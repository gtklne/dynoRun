import { describe, it, expect } from 'vitest';
import { computeRunQuality } from '@/analysis/run-quality';
import type { DifferentiatedSample, RawSpeedSample, SmoothedSample } from '@/analysis/types';

function syncSmoothed(raw: RawSpeedSample[]): SmoothedSample[] {
  return raw.map((s) => ({ ...s }));
}

function diffFrom(smoothed: SmoothedSample[]): DifferentiatedSample[] {
  const out: DifferentiatedSample[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    if (i === 0 || i === smoothed.length - 1) {
      out.push({ ...smoothed[i], accel_ms2: 0 });
    } else {
      const dt = (smoothed[i + 1].t_ms - smoothed[i - 1].t_ms) / 1000;
      const a = dt > 0 ? (smoothed[i + 1].speed_mps - smoothed[i - 1].speed_mps) / dt : 0;
      out.push({ ...smoothed[i], accel_ms2: a });
    }
  }
  return out;
}

describe('computeRunQuality', () => {
  it('rates a clean constant-accel run as good', () => {
    const raw: RawSpeedSample[] = Array.from({ length: 81 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: i * 0.4,
    }));
    const smoothed = syncSmoothed(raw);
    const r = computeRunQuality({ raw, smoothed, differentiated: diffFrom(smoothed) });
    expect(r.rating).toBe('good');
    expect(r.flags).toEqual([]);
    expect(r.score).toBe(100);
  });

  it('flags short runs and lowers the score', () => {
    const raw: RawSpeedSample[] = Array.from({ length: 15 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: i * 0.4,
    }));
    const smoothed = syncSmoothed(raw);
    const r = computeRunQuality({ raw, smoothed, differentiated: diffFrom(smoothed) });
    expect(r.flags).toContain('short_run');
    expect(r.score).toBeLessThan(100);
  });

  it('flags gps dropouts on large inter-sample gaps', () => {
    const raw: RawSpeedSample[] = [
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 100, speed_mps: 1 },
      { t_ms: 200, speed_mps: 2 },
      { t_ms: 1800, speed_mps: 10 },
      { t_ms: 1900, speed_mps: 11 },
      { t_ms: 2000, speed_mps: 12 },
    ];
    const smoothed = syncSmoothed(raw);
    const r = computeRunQuality({ raw, smoothed, differentiated: diffFrom(smoothed) });
    expect(r.flags).toContain('gps_dropouts');
    expect(r.max_gap_ms).toBe(1600);
  });

  it('flags noisy speed when raw deviates from smoothed', () => {
    const raw: RawSpeedSample[] = Array.from({ length: 81 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: i * 0.4 + (i % 2 === 0 ? 1.5 : -1.5),
    }));
    const smoothed: SmoothedSample[] = Array.from({ length: 81 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: i * 0.4,
    }));
    const r = computeRunQuality({ raw, smoothed, differentiated: diffFrom(smoothed) });
    expect(r.flags).toContain('noisy_speed');
    expect(r.speed_rmse_mps).toBeGreaterThan(0.6);
  });

  it('flags acceleration spikes for unrealistic peak accel', () => {
    const raw: RawSpeedSample[] = Array.from({ length: 81 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: i * 0.4,
    }));
    const smoothed = syncSmoothed(raw);
    const diff = diffFrom(smoothed);
    diff[20].accel_ms2 = 18;
    const r = computeRunQuality({ raw, smoothed, differentiated: diff });
    expect(r.flags).toContain('acceleration_spikes');
    expect(r.peak_abs_accel_ms2).toBe(18);
    expect(r.score).toBeLessThan(100);
  });

  it('returns poor rating for empty input', () => {
    const r = computeRunQuality({ raw: [], smoothed: [], differentiated: [] });
    expect(r.rating).toBe('poor');
    expect(r.flags).toContain('short_run');
    expect(r.score).toBe(0);
  });
});
