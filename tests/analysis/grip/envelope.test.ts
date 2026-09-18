import { describe, expect, it } from 'vitest';
import { ENVELOPE_BINS, computeEnvelope, envelopeRadius } from '@/analysis/grip/envelope';
import { computeCombined, frontWeightFraction } from '@/analysis/grip/load';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';

function observations(n = 2000, g = 0.9) {
  return {
    spdS: new Float32Array(n).fill(30), comb: new Float32Array(n).fill(g),
    theta: Float32Array.from({ length: n }, (_, i) => -Math.PI + (i + 0.5) / n * 2 * Math.PI),
    alongRaw: new Float32Array(n),
  };
}
describe('observed demand envelope', () => {
  it('recovers the analytic RMS of a fully observed circle', () => {
    const e = computeEnvelope(observations(), DEFAULT_GRIP_SETTINGS);
    expect(e.emptyBins).toBe(0);
    for (const r of e.env) expect(r).toBeCloseTo(0.9, 5);
    expect(e.sessionScore).toBeCloseTo(90, 4);
  });
  it('does not invent unobserved directions or a full-circle score', () => {
    const ch = observations(); ch.theta.fill(0);
    const e = computeEnvelope(ch, DEFAULT_GRIP_SETTINGS);
    expect(e.emptyBins).toBe(71);
    expect(e.env[36]).toBeCloseTo(0.9);
    expect(Number.isNaN(e.env[0])).toBe(true);
    expect(Number.isNaN(e.sessionScore)).toBe(true);
  });
  it('requires duration support and does not bridge timestamp gaps', () => {
    const ch = observations(2, 2.25); ch.theta.fill(0);
    expect(computeEnvelope(ch, DEFAULT_GRIP_SETTINGS).emptyBins).toBe(72);
    const long = observations(100); long.theta.fill(0);
    const t = Array.from({ length: 100 }, (_, i) => i * 0.001 + (i >= 50 ? 10 : 0));
    expect(computeEnvelope(long, DEFAULT_GRIP_SETTINGS, undefined, t).emptyBins).toBe(72);
  });
  it('excludes slow and untimed observations', () => {
    const ch = observations(3000, 2); ch.theta.fill(0);
    const lap = Array.from({ length: 3000 }, (_, i) => i < 1000 ? 0 : 1);
    for (let i = 1000; i < 2000; i++) ch.spdS[i] = 1;
    for (let i = 2000; i < 3000; i++) ch.comb[i] = 0.8;
    expect(computeEnvelope(ch, DEFAULT_GRIP_SETTINGS, lap).gref).toBeCloseTo(0.8, 5);
  });
  it('uses duration rather than sample counts for p95', () => {
    const ch = observations(101); ch.theta.fill(0);
    for (let i = 0; i < 10; i++) ch.comb[i] = 3;
    const t = Array.from({ length: 101 }, (_, i) => i < 10 ? i * 0.001 : 0.01 + (i - 10) * 0.04);
    // 10% of samples are high, but less than 1% of elapsed time.
    expect(computeEnvelope(ch, DEFAULT_GRIP_SETTINGS, undefined, t).gref).toBeCloseTo(0.9, 5);
  });
  it('does not label finite values impossible using a universal g cap', () => {
    const ch = observations(100, 3); ch.theta.fill(0); ch.alongRaw.fill(2);
    expect(computeEnvelope(ch, DEFAULT_GRIP_SETTINGS).gref).toBe(3);
  });
  it('returns missing values when no observations qualify', () => {
    const ch = observations(); ch.spdS.fill(0);
    const e = computeEnvelope(ch, DEFAULT_GRIP_SETTINGS);
    expect(e.fitSamples).toBe(0);
    expect(e.emptyBins).toBe(72);
    expect(Number.isNaN(e.gref)).toBe(true);
    expect(Number.isNaN(e.sessionScore)).toBe(true);
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
    expect(frontWeightFraction(-5, 0.45)).toBe(1);
    expect(frontWeightFraction(5, 0.45)).toBe(0);
  });
});
