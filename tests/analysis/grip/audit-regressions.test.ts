import { describe, expect, it } from 'vitest';
import { computeChannels, GRAVITY, resistanceG } from '@/analysis/grip/channels';
import { timeAverage, timeDerivative } from '@/analysis/grip/time-series';
import { computeCombined } from '@/analysis/grip/load';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { isStoredGripData, packGripData, unpackGripData } from '@/analysis/grip/storage';
import { isGripDataEnvelope } from '../../../server/src/lib/grip-data-validation';
import { buildLaps } from '@/analysis/grip/laps';
import { DEFAULT_GRIP_SETTINGS, sanitizeGripSettings } from '@/analysis/grip/settings';
import { detectCorners, cornerStats } from '@/analysis/grip/corners';
import { clusterByAxisDistance } from '@/analysis/grip/turn-cluster';
import { geoFrame, resampleByDistance, valueAtU } from '@/analysis/grip/align';
import { projectTrack } from '@/analysis/grip/project';
import { dutyMetres, lapPace, sectorScores } from '@/analysis/grip/compare-stats';
import { compareLaps, type CompareGrid, type CompareLapResult } from '@/analysis/grip/compare';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { formatLapTime } from '@/ui/grip/format-lap';
import { BASE_PACE, circuitCsv, simulateSession } from './synthetic-circuit';
import type { GripChannels } from '@/analysis/grip/types';

function channels(t: number[], speed = (s: number) => 20 + 2 * s): GripChannels {
  return { t, spd: t.map(speed), lean: t.map(() => 45), lat: t.map(() => 47), lon: t.map((s) => 8 + s / 1e4), lap: t.map(() => 1), head: t.map(() => 0) };
}
function csv(overrides: Record<string, string> = {}, times = Array.from({ length: 31 }, (_, i) => i * 0.04)) {
  const keys = ['Time', 'Latitude', 'Longitude', 'Speed (m/s)', 'Lap', 'Heading', 'LeanAngle (deg)'];
  return ['Track,"Test, Ring"', 'Best Lap Time,1:23.45', 'Record,' + keys.join(','), ...times.map((t, i) => {
    const row: Record<string, string> = { Time: new Date(Date.UTC(2026, 0, 1) + t * 1000).toISOString(), Latitude: '47', Longitude: '8', 'Speed (m/s)': '20', Lap: '1', Heading: '0', 'LeanAngle (deg)': '45' };
    if (i === 10) Object.assign(row, overrides);
    return [i, ...keys.map((k) => row[k])].join(',');
  })].join('\n');
}

describe('audit: analytic signals and support', () => {
  it.each([10, 25, 50])('preserves a 2 m/s² ramp and 45 degree lean at %i Hz including edges', (hz) => {
    const ch = channels(Array.from({ length: 6 * hz }, (_, i) => i / hz));
    const d = computeChannels(ch, 9);
    for (let i = 0; i < ch.t.length; i++) {
      expect(d.alongRaw[i]).toBeCloseTo(2 / GRAVITY, 4);
      expect(d.alat[i]).toBeCloseTo(1, 6);
      expect(d.along[i]).toBeCloseTo(2 / GRAVITY + resistanceG(ch.spd[i]), 4);
    }
  });
  it('preserves irregular linear data and splits at gaps', () => {
    const t = [0, .04, .081, .12, .16, 2, 2.04, 2.08, 2.12];
    const a = t.map((t) => 10 + 3 * t);
    expect(Array.from(timeAverage(t, a, .16))).toEqual(expect.arrayContaining([10]));
    for (const value of timeDerivative(t, timeAverage(t, a, .16))) expect(value).toBeCloseTo(3, 4);
    const step = channels(t, (t) => t < 1 ? 20 : 40);
    for (const g of computeChannels(step, 9).alongRaw) expect(g).toBeCloseTo(0, 6);
  });
  it('does not allow a missing fix to contaminate neighbouring demand', () => {
    const ch = channels(Array.from({ length: 100 }, (_, i) => i / 25), () => 20);
    ch.positionValid = ch.t.map(() => true); ch.positionValid[50] = false; ch.spd[50] = 900;
    const d = computeChannels(ch, 9);
    expect(d.comb[50]).toBeNaN();
    for (const i of [48, 49, 51, 52]) expect(d.alongRaw[i]).toBeCloseTo(0, 6);
  });
  it('tau zero is exactly demand even when the derivative is unavailable', () => {
    expect(Array.from(computeCombined(new Float32Array([1, 2]), new Float32Array([NaN, 5]), 0))).toEqual([1, 2]);
    expect(sanitizeGripSettings({ tau: 0, speedSmooth: 8.4 })).toMatchObject({ tau: 0, speedSmooth: 9 });
  });
  it('leaves unsupported quadrant scores unavailable', () => {
    const env = new Float32Array(72).fill(NaN); env.fill(1, 27, 45);
    expect(sectorScores(env)).toEqual({ right: 100, left: NaN, brake: NaN, accel: NaN });
  });
});

describe('audit: ingestion and persistence', () => {
  it.each([
    ['Speed (m/s)', '"1"2'], ['Speed (m/s)', ''], ['Speed (m/s)', 'Infinity'], ['Speed (m/s)', '-1'],
    ['LeanAngle (deg)', ''], ['LeanAngle (deg)', '90'], ['LeanAngle (deg)', '-90'],
    ['Latitude', '100'], ['Longitude', '200'], ['Lap', '1.5'],
  ])('rejects invalid %s=%s', (key, value) => expect(() => parseRaceboxCsv(csv({ [key]: value }))).toThrow());
  it('accepts either zero meridian, quotes and minutes:seconds metadata', () => {
    expect(parseRaceboxCsv(csv({ Longitude: '0' })).ch.positionValid![10]).toBe(true);
    expect(parseRaceboxCsv(csv({ Latitude: '0' })).ch.positionValid![10]).toBe(true);
    expect(parseRaceboxCsv(csv()).meta).toMatchObject({ track: 'Test, Ring', best: 83.45 });
  });
  it('preserves quality counters and every missing-fix index across JSON storage', () => {
    const p = parseRaceboxCsv(csv({ Latitude: '', Longitude: '' }));
    p.dropped = 3;
    const back = unpackGripData(JSON.parse(JSON.stringify(packGripData(p))));
    expect(back).toMatchObject({ noFix: 1, dropped: 3 });
    expect(back.ch.positionValid).toEqual(p.ch.positionValid);
    expect(parseRaceboxCsv(csv({ Time: 'invalid' })).dropped).toBe(1);
  });
  it('validates all elements, metadata and lap identity in client and API', () => {
    const good = packGripData(parseRaceboxCsv(csv()));
    const mutations = [
      (v: any) => { v.ch.spd[1] = null; },
      (v: any) => { delete v.ch.spd[1]; },
      (v: any) => { delete v.ch.positionValid[1]; },
      (v: any) => { v.noFix = 99; },
      (v: any) => { v.meta = {}; },
      (v: any) => { v.ch.t[10] = v.ch.t[9]; },
      (v: any) => { v.ch.lap[10] = 0; },
      (v: any) => { v.ch.positionValid[10] = 0; },
    ];
    for (const mutate of mutations) {
      const v = structuredClone(good); mutate(v);
      expect(isStoredGripData(v)).toBe(false); expect(isGripDataEnvelope(v)).toBe(false);
    }
    const legacy = { ...good, version: 1 }; delete legacy.ch.positionValid;
    expect(isStoredGripData(legacy)).toBe(true);
  });
  it('uses elapsed duration and preserves precise timestamps and lean on save', () => {
    expect(() => parseRaceboxCsv(csv({}, Array.from({ length: 31 }, (_, i) => i / 100)))).toThrow(/short/);
    const p = parseRaceboxCsv(csv()); p.ch.t[1] = 0.040001; p.ch.lean[1] = 89.9999;
    const packed = packGripData(p);
    expect(packed.ch.t[1]).toBe(p.ch.t[1]); expect(packed.ch.lean[1]).toBe(p.ch.lean[1]);
    expect(isStoredGripData(packed)).toBe(true);
  });
});

describe('audit: laps, corners and spatial arithmetic', () => {
  it('includes the completed boundary interval and rejects repeated lap fragments', () => {
    const ch = channels([0, 1, 2, 3, 4]); ch.lap = [1, 1, 2, 2, 0];
    const d = { ...computeChannels(ch, 9), loadRate: new Float32Array(5) };
    const meta = { track: '', config: '', date: '', best: null, laps: [] };
    const laps = buildLaps(ch, d, meta, DEFAULT_GRIP_SETTINGS);
    expect(laps.map((l) => l.time)).toEqual([2, 2]); expect(laps.every((l) => l.estimatedTime)).toBe(true);
    ch.lap = [1, 1, 0, 1, 1]; expect(() => buildLaps(ch, d, meta, DEFAULT_GRIP_SETTINGS)).toThrow(/contiguous/);
  });
  it.each([10, 25, 50])('finds a constant-speed bend at %i Hz within time bounds', (hz) => {
    const ch = channels(Array.from({ length: 10 * hz + 1 }, (_, i) => i / hz), () => 20);
    const d = { ...computeChannels(ch, 9), t: ch.t, loadRate: new Float32Array(ch.t.length) };
    const corners = detectCorners(d, 0, ch.t.length - 1, DEFAULT_GRIP_SETTINGS);
    expect(corners).toHaveLength(1);
    const c = corners[0]; expect(c.tApex).toBeCloseTo(5, 2);
    expect(c.tApex - c.tStart).toBeLessThanOrEqual(4); expect(c.tEnd - c.tApex).toBeLessThanOrEqual(4);
    expect(cornerStats({ l: 0, r: 4, ap: 2 }, [1, 1, 1, 1, 9]).peak).toBe(9);
  });
  it('keeps nearby left and right turns separate with interleaved detections', () => {
    const cl = clusterByAxisDistance([{ s: 0, dir: 'L' as const }, { s: 30, dir: 'R' as const }, { s: 31, dir: 'L' as const }, { s: 35, dir: 'R' as const }]);
    expect(cl.map((c) => c.map((h) => h.dir))).toEqual([['L', 'L'], ['R', 'R']]);
  });
  it('uses the same WGS84 frame in the session map and comparison', () => {
    const lat = [46.999, 47.001], lon = [7.999, 8.001];
    const p = projectTrack(lat, lon), f = geoFrame(47, 8);
    expect(p.py[1] - p.py[0]).toBeCloseTo(.002 * f.ky, 4);
    expect(p.px[1] - p.px[0]).toBeCloseTo(.002 * f.kx, 4);
  });
  it('uses the last sample consistently at distance plateaus including the start', () => {
    expect(valueAtU([0, 1, 2], [2, 3, NaN], 1)).toBe(3);
    const u = [0, 0, 5, 5, 10], values = [0, 2, 4, 6, 10], grid = [0, 2.5, 5, 10];
    expect(Array.from(resampleByDistance(u, values, grid))).toEqual([2, 3, 6, 10]);
    for (const [i, g] of grid.entries()) expect(resampleByDistance(u, values, grid)[i]).toBe(valueAtU(u, values, g));
  });
  it('integrates clipped cells and threshold crossings exactly', () => {
    const grid = { along: new Float32Array([-1, 1]), comb: new Float32Array([0, 2]), lean: new Float32Array([-60, 60]) } as CompareGrid;
    const duty = dutyMetres(new Float32Array([0, 10]), grid, { section: { sIn: 3, sOut: 7 } });
    expect(duty.total).toBeCloseTo(4, 10);
    expect(duty.brake).toBeCloseTo(1.5, 10); expect(duty.coast).toBeCloseTo(1, 10); expect(duty.drive).toBeCloseTo(1.5, 10);
    expect(duty.aboveG).toBeCloseTo(3, 10); expect(duty.aboveLean).toBe(0);
  });
  it('computes mean pace from the lap’s own duration and carries time rounding', () => {
    const lap = { pathLength: 2000, path: { te: [0, 100], k0: 0, kEnd: 1 }, grid: { t: [0, 20] } } as unknown as CompareLapResult;
    expect(lapPace(lap)).toBe(20);
    expect(formatLapTime(119.999)).toBe('2:00.00'); expect(formatLapTime(59.999)).toBe('1:00.00');
  });
  it('reports and masks a gap in the reference as well as the subject', () => {
    const p = parseRaceboxCsv(circuitCsv(simulateSession([BASE_PACE, BASE_PACE], 1)));
    const baseline = analyzeGripSession(p, DEFAULT_GRIP_SETTINGS);
    const at = Math.floor((baseline.laps[0].start + baseline.laps[0].end) / 2);
    p.ch.positionValid![at] = false;
    const a = analyzeGripSession(p, DEFAULT_GRIP_SETTINGS);
    const inputs = a.laps.map((lap) => ({ key: `${lap.num}`, label: '', sessionId: 's', analysis: a, lap, metric: a.comb }));
    const cmp = compareLaps(inputs, inputs[0].key)!;
    const ref = cmp.laps[0];
    expect(ref.maxGapM).toBeGreaterThan(0); expect(ref.coverage).toBeLessThan(1); expect(ref.finishDelta).toBeNaN();
    for (const lap of cmp.laps) for (let k = 0; k < cmp.s.length; k++) if (cmp.s[k] < lap.section.sIn || cmp.s[k] > lap.section.sOut) {
      expect(lap.grid.dt[k]).toBeNaN(); expect(lap.grid.spd[k]).toBeNaN();
    }
  });
});
