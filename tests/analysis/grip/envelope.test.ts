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

    const { env, gref, sessionScore } = computeEnvelope({ spdS, comb, theta }, { envMinSpeed: 18 });
    expect(env.length).toBe(ENVELOPE_BINS);
    for (let b = 0; b < ENVELOPE_BINS; b++) expect(env[b]).toBeCloseTo(0.9, 3);
    expect(gref).toBeCloseTo(0.9, 3);
    // a full circle of radius 0.9 scores 90 (100 ≈ a full 1 g circle)
    expect(sessionScore).toBeCloseTo(90, 1);
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
    const { gref } = computeEnvelope({ spdS, comb, theta }, { envMinSpeed: 18 });
    expect(gref).toBeLessThan(1);
  });

  it('fits from timed laps only when the session has any', () => {
    // out-lap (lap 0) pretends to pull 2 g; timed lap 1 rides at 0.8 g
    const n = 1000;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n);
    const theta = new Float32Array(n);
    const lap: number[] = [];
    for (let i = 0; i < n; i++) {
      theta[i] = -Math.PI + (2 * Math.PI * i) / n;
      const timed = i % 2 === 0;
      comb[i] = timed ? 0.8 : 2.0;
      lap.push(timed ? 1 : 0);
    }
    const { gref } = computeEnvelope({ spdS, comb, theta }, { envMinSpeed: 18 }, lap);
    expect(gref).toBeCloseTo(0.8, 2);
  });

  it('fills bins that were never visited from their neighbours', () => {
    // only right-hand corners: theta clustered near 0
    const n = 500;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n).fill(0.7);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) theta[i] = -0.3 + (0.6 * i) / n;
    const { env } = computeEnvelope({ spdS, comb, theta }, { envMinSpeed: 18 });
    for (let b = 0; b < ENVELOPE_BINS; b++) {
      expect(Number.isFinite(env[b])).toBe(true);
      expect(env[b]).toBeCloseTo(0.7, 3);
    }
  });

  it('never smooths the boundary below the data it was fit on', () => {
    // one hard direction spike amid gentle riding: the bin containing the
    // spike must keep its full radius after smoothing
    const n = 1000;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n).fill(0.3);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) theta[i] = -Math.PI + (2 * Math.PI * i) / n;
    for (let i = 490; i < 510; i++) comb[i] = 1.2; // spike near theta ≈ 0
    const { env } = computeEnvelope({ spdS, comb, theta }, { envMinSpeed: 18 });
    let maxEnv = 0;
    for (let b = 0; b < ENVELOPE_BINS; b++) maxEnv = Math.max(maxEnv, env[b]);
    expect(maxEnv).toBeGreaterThanOrEqual(1.2 - 1e-3);
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
  it('adds the transient orthogonally and never reduces the demand', () => {
    const comb = new Float32Array([0, 0.5, 1]);
    const loadRate = new Float32Array([1, 1, 0]);
    const out = computeCombined(comb, loadRate, 0.3);
    expect(out[0]).toBeCloseTo(0.3, 5); // pure transient: τ·rate = 0.3 g
    expect(out[1]).toBeCloseTo(Math.hypot(0.5, 0.3), 5);
    expect(out[2]).toBeCloseTo(1, 5); // no transient → unchanged
    for (let i = 0; i < 3; i++) expect(out[i]).toBeGreaterThanOrEqual(comb[i]);
  });

  it('scales the transient linearly with τ', () => {
    const out1 = computeCombined(new Float32Array([0]), new Float32Array([2]), 0.15);
    const out2 = computeCombined(new Float32Array([0]), new Float32Array([2]), 0.3);
    expect(out1[0]).toBeCloseTo(0.3, 5);
    expect(out2[0]).toBeCloseTo(0.6, 5);
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
