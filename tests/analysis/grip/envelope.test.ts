import { describe, expect, it } from 'vitest';
import { ENVELOPE_BINS, computeEnvelope, envelopeRadius } from '@/analysis/grip/envelope';
import { computeCombined, frontWeightFraction } from '@/analysis/grip/load';

describe('computeEnvelope', () => {
  it('fits a circular envelope from samples on a known circle', () => {
    // samples uniformly around the g-g circle at radius 0.9, all fast enough
    const n = 2000;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n).fill(0.9);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) theta[i] = -Math.PI + (2 * Math.PI * i) / n;

    const { env, gref, util } = computeEnvelope({ spdS, comb, theta }, { envPct: 90, envMinSpeed: 18 });
    expect(env.length).toBe(ENVELOPE_BINS);
    for (let b = 0; b < ENVELOPE_BINS; b++) expect(env[b]).toBeCloseTo(0.9, 3);
    expect(gref).toBeCloseTo(0.9, 3);
    // every sample sits exactly on its own limit
    for (let i = 10; i < n - 10; i += 37) expect(util[i]).toBeCloseTo(1, 2);
  });

  it('excludes slow samples from the fit', () => {
    const n = 1000;
    const spdS = new Float32Array(n);
    const comb = new Float32Array(n);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      theta[i] = -Math.PI + (2 * Math.PI * i) / n;
      // slow samples pretend to pull 2 g — they must not inflate the envelope
      const slow = i % 2 === 0;
      spdS[i] = slow ? 1 : 30;
      comb[i] = slow ? 2.0 : 0.8;
    }
    const { gref } = computeEnvelope({ spdS, comb, theta }, { envPct: 90, envMinSpeed: 18 });
    expect(gref).toBeLessThan(1);
  });

  it('fills bins that were never visited from their neighbours', () => {
    // only right-hand corners: theta clustered near 0
    const n = 500;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n).fill(0.7);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) theta[i] = -0.3 + (0.6 * i) / n;
    const { env } = computeEnvelope({ spdS, comb, theta }, { envPct: 90, envMinSpeed: 18 });
    for (let b = 0; b < ENVELOPE_BINS; b++) {
      expect(Number.isFinite(env[b])).toBe(true);
      expect(env[b]).toBeCloseTo(0.7, 3);
    }
  });
});

describe('envelopeRadius', () => {
  it('wraps theta into the bin range', () => {
    const env = new Float32Array(ENVELOPE_BINS);
    for (let b = 0; b < ENVELOPE_BINS; b++) env[b] = b;
    expect(envelopeRadius(env, -Math.PI)).toBe(0);
    expect(envelopeRadius(env, Math.PI - 1e-6)).toBe(ENVELOPE_BINS - 1);
  });
});

describe('computeCombined', () => {
  it('adds the transient orthogonally and never reduces utilization', () => {
    const util = new Float32Array([0, 0.5, 1]);
    const loadRate = new Float32Array([1, 1, 0]);
    const out = computeCombined(util, loadRate, 1, 0.3);
    expect(out[0]).toBeCloseTo(0.3, 5); // pure transient
    expect(out[1]).toBeCloseTo(Math.hypot(0.5, 0.3), 5);
    expect(out[2]).toBeCloseTo(1, 5); // no transient → unchanged
    for (let i = 0; i < 3; i++) expect(out[i]).toBeGreaterThanOrEqual(util[i]);
  });

  it('caps the transient demand at 1.3', () => {
    const out = computeCombined(new Float32Array([0]), new Float32Array([100]), 1, 0.6);
    expect(out[0]).toBeCloseTo(1.3, 5);
  });
});

describe('frontWeightFraction', () => {
  it('shifts load forward under braking and rearward on throttle', () => {
    expect(frontWeightFraction(0, 0.45)).toBeCloseTo(0.5, 5);
    expect(frontWeightFraction(-1, 0.45)).toBeCloseTo(0.95, 5);
    expect(frontWeightFraction(1, 0.45)).toBeCloseTo(0.05, 5);
    // clamped
    expect(frontWeightFraction(-5, 0.45)).toBe(0.98);
    expect(frontWeightFraction(5, 0.45)).toBe(0.02);
  });
});
