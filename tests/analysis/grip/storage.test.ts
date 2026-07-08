import { describe, expect, it } from 'vitest';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { isStoredGripData, packGripData, unpackGripData } from '@/analysis/grip/storage';
import { syntheticCsv } from './synthetic';

describe('grip storage envelope', () => {
  it('round-trips a parsed session', () => {
    const parsed = parseRaceboxCsv(syntheticCsv());
    const packed = packGripData(parsed);
    expect(isStoredGripData(packed)).toBe(true);
    expect(isStoredGripData(JSON.parse(JSON.stringify(packed)))).toBe(true);

    const back = unpackGripData(packed);
    expect(back.n).toBe(parsed.n);
    expect(back.meta).toEqual(parsed.meta);
    for (let i = 0; i < parsed.n; i += 101) {
      expect(back.ch.t[i]).toBeCloseTo(parsed.ch.t[i], 3);
      expect(back.ch.spd[i]).toBeCloseTo(parsed.ch.spd[i], 3);
      expect(back.ch.lean[i]).toBeCloseTo(parsed.ch.lean[i], 2);
      expect(back.ch.lat[i]).toBeCloseTo(parsed.ch.lat[i], 6);
      expect(back.ch.lap[i]).toBe(parsed.ch.lap[i]);
    }
  });

  it('rejects malformed envelopes', () => {
    expect(isStoredGripData(null)).toBe(false);
    expect(isStoredGripData({})).toBe(false);
    expect(isStoredGripData({ version: 99, meta: {}, ch: { t: [] } })).toBe(false);
    // mismatched channel lengths
    expect(
      isStoredGripData({
        version: 1,
        meta: {},
        ch: { t: [0, 1], lat: [0], lon: [0, 0], spd: [0, 0], lean: [0, 0], lap: [0, 0], head: [0, 0] },
      }),
    ).toBe(false);
  });
});
