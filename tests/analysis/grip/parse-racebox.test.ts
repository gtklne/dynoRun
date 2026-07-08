import { describe, expect, it } from 'vitest';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import { HZ, LAP_S, OUT_S, syntheticCsv } from './synthetic';

describe('parseRaceboxCsv', () => {
  it('parses metadata and all samples', () => {
    const s = parseRaceboxCsv(syntheticCsv());
    expect(s.meta.track).toBe('Testring');
    expect(s.meta.config).toBe('GP');
    expect(s.meta.date).toBe('2026-07-08');
    expect(s.meta.best).toBeCloseTo(LAP_S - 0.5, 2);
    expect(s.meta.laps).toEqual([
      { name: 'Lap 1', time: LAP_S - 0.5 },
      { name: 'Lap 2', time: LAP_S },
    ]);
    expect(s.n).toBe((OUT_S + 2 * LAP_S) * HZ);
    expect(s.ch.t[0]).toBe(0);
    expect(s.ch.t[s.n - 1]).toBeCloseTo(OUT_S + 2 * LAP_S - 1 / HZ, 3);
    expect(s.ch.spd[0]).toBeCloseTo(15, 3);
    expect(s.ch.lap[0]).toBe(0);
    expect(s.ch.lap[s.n - 1]).toBe(2);
  });

  it('skips rows with malformed timestamps', () => {
    const csv = syntheticCsv();
    const lines = csv.trimEnd().split('\n');
    lines.splice(10, 0, '999,not-a-date,47,8,30,1,0,0');
    const s = parseRaceboxCsv(lines.join('\n'));
    expect(s.n).toBe((OUT_S + 2 * LAP_S) * HZ);
  });

  it('rejects files without a Record header', () => {
    expect(() => parseRaceboxCsv('just,some,garbage\n1,2,3')).toThrow(/Record/);
  });

  it('rejects exports missing the lean column', () => {
    const csv = [
      'Track,X',
      'Record,Time,Latitude,Longitude,Speed (m/s),Lap,Heading',
      `1,2026-07-08T10:00:00.000Z,47,8,30,1,0`,
    ].join('\n');
    expect(() => parseRaceboxCsv(csv)).toThrow(/LeanAngle/);
  });

  it('rejects sessions shorter than a second', () => {
    const lines = ['Record,Time,Latitude,Longitude,Speed (m/s),Lap,Heading,LeanAngle (deg)'];
    for (let i = 0; i < 10; i++) {
      lines.push(`${i},2026-07-08T10:00:0${Math.floor(i / 10)}.${(i % 10) * 100}Z,47,8,30,1,0,0`);
    }
    expect(() => parseRaceboxCsv(lines.join('\n'))).toThrow(/too short/);
  });
});
