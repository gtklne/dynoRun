import { describe, expect, it } from 'vitest';
import { ENVELOPE_BINS, computeEnvelope, envelopeRadius } from '@/analysis/grip/envelope';
import { computeCombined, frontWeightFraction } from '@/analysis/grip/load';
import { DEFAULT_GRIP_SETTINGS } from '@/analysis/grip/settings';

describe('computeEnvelope', () => {
  it('fits a circular envelope from samples on a known circle', () => {
    // samples uniformly around the g-g circle at radius 0.9, all fast enough
    const n = 2000;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n).fill(0.9);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) theta[i] = -Math.PI + (2 * Math.PI * i) / n;

    const { env, gref, sessionScore } = computeEnvelope({ spdS, comb, theta, alongRaw: new Float32Array(spdS.length) }, { envMinSpeed: 18 });
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
    const { gref } = computeEnvelope({ spdS, comb, theta, alongRaw: new Float32Array(spdS.length) }, { envMinSpeed: 18 });
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
    const { gref } = computeEnvelope({ spdS, comb, theta, alongRaw: new Float32Array(spdS.length) }, { envMinSpeed: 18 }, lap);
    expect(gref).toBeCloseTo(0.8, 2);
  });

  it('fills bins that were never visited from their neighbours', () => {
    // only right-hand corners: theta clustered near 0
    const n = 500;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n).fill(0.7);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) theta[i] = -0.3 + (0.6 * i) / n;
    const { env } = computeEnvelope({ spdS, comb, theta, alongRaw: new Float32Array(spdS.length) }, { envMinSpeed: 18 });
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
    const { env } = computeEnvelope({ spdS, comb, theta, alongRaw: new Float32Array(spdS.length) }, { envMinSpeed: 18 });
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

// ── Hardening the fit against the failure modes that make the headline score lie.

describe('computeEnvelope robustness', () => {
  const N = 4000;
  /** A ring of steady g at `g`, spread over every angular bin. */
  function ring(g: number, n = N) {
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n).fill(g);
    const theta = new Float32Array(n);
    for (let i = 0; i < n; i++) theta[i] = -Math.PI + ((i % 720) / 720) * 2 * Math.PI;
    return { spdS, comb, theta, alongRaw: new Float32Array(n) };
  }

  // Reachable through the sanctioned slider range: envMinSpeed goes to 60 km/h and
  // its own help text invites raising it. Every bin then stays NaN, gref becomes
  // NaN via Math.max(0, NaN), and the header rendered "session score NaN" while
  // the traction circle silently lost its boundary to NaN moveTo/lineTo.
  it('reports no envelope rather than NaN when nothing qualifies for the fit', () => {
    const ch = ring(0.5);
    ch.spdS.fill(2); // slower than any envMinSpeed
    const e = computeEnvelope(ch, DEFAULT_GRIP_SETTINGS);
    expect(e.fitSamples).toBe(0);
    expect(e.sessionScore).toBe(0);
    expect(e.gref).toBe(0);
    expect(Array.from(e.env).every(Number.isFinite)).toBe(true);
  });

  // The fill used to read the array it was writing, so a run of empty bins was
  // filled entirely from its left neighbour: with bins 0 and 36 populated, bins
  // 1..35 all took bin 0's radius regardless of which side was nearer.
  it('fills an empty bin from its nearest populated neighbour, not from the left', () => {
    const n = 2000;
    const spdS = new Float32Array(n).fill(30);
    const comb = new Float32Array(n);
    const theta = new Float32Array(n);
    const thetaOfBin = (b: number) => -Math.PI + ((b + 0.5) / ENVELOPE_BINS) * 2 * Math.PI;
    // only two bins carry data, and they are far apart and very different
    for (let i = 0; i < n; i++) {
      const hot = i < n / 2;
      comb[i] = hot ? 1.4 : 0.4;
      theta[i] = thetaOfBin(hot ? 0 : ENVELOPE_BINS / 2);
    }
    const e = computeEnvelope({ spdS, comb, theta, alongRaw: new Float32Array(spdS.length) }, DEFAULT_GRIP_SETTINGS);
    expect(e.emptyBins).toBe(ENVELOPE_BINS - 2);
    // a bin adjacent to the 0.4 g side must not inherit the 1.4 g side's radius
    const nearLow = e.env[ENVELOPE_BINS / 2 - 1];
    expect(nearLow).toBeLessThan(0.7);
    // and the reverse: a bin next to the hot side stays hot
    expect(e.env[1]).toBeGreaterThan(1.0);
  });

  // CLAUDE.md states ">2.5 g GPS artifacts excluded" as part of the contract, and
  // no test covered it: deleting the guard passed 83/83, while a 0.4 s speed step
  // took the score from 99 to 221 and the circle's scale to 8.4 g.
  it('excludes physically impossible samples from the boundary', () => {
    const ch = ring(0.8);
    for (let i = 100; i < 110; i++) ch.comb[i] = 9; // a reacquisition step
    const e = computeEnvelope(ch, DEFAULT_GRIP_SETTINGS);
    expect(e.gref).toBeLessThan(1.0);
  });

  // A percentile alone could not promise this: most angular bins hold under 100
  // samples, so p99 was literally the bin maximum, while the channel smoothing
  // smears one bad fix over ~10 consecutive samples.
  it('is not moved by a burst of sub-cutoff noise in one direction', () => {
    const clean = computeEnvelope(ring(0.8), DEFAULT_GRIP_SETTINGS);
    const dirty = ring(0.8);
    // 10 samples of a plausible-but-wrong 2.2 g, all in one angular bin
    for (let i = 200; i < 210; i++) { dirty.comb[i] = 2.2; dirty.theta[i] = -Math.PI + 0.01; }
    const e = computeEnvelope(dirty, DEFAULT_GRIP_SETTINGS);
    expect(e.gref - clean.gref).toBeLessThan(0.05);
    expect(Math.abs(e.sessionScore - clean.sessionScore)).toBeLessThan(2);
  });

  it('counts the samples it fitted on, so a thin fit can be disclosed', () => {
    const e = computeEnvelope(ring(0.9), DEFAULT_GRIP_SETTINGS);
    expect(e.fitSamples).toBe(N);
    expect(e.emptyBins).toBe(0);
  });
});
