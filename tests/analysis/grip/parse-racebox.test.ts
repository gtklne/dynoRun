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

// ── Inputs that used to be accepted, or rejected with the wrong explanation.

describe('parseRaceboxCsv hardening', () => {
  const HEADER = 'Record,Time,Latitude,Longitude,Speed (m/s),Lap,Heading,LeanAngle (deg)';
  const row = (i: number, over: Partial<Record<string, string>> = {}) => {
    const cells: Record<string, string> = {
      Record: String(i + 1),
      Time: new Date(Date.UTC(2026, 5, 6, 10, 0, 0) + i * 40).toISOString(),
      Latitude: '47.9012345',
      Longitude: '7.2345678',
      'Speed (m/s)': '30',
      Lap: '1',
      Heading: '90',
      'LeanAngle (deg)': '10',
      ...over,
    };
    return HEADER.split(',').map((k) => cells[k]).join(',');
  };
  const csv = (rows: string[]) => ['Track,Test', 'Configuration,GP', HEADER, ...rows].join('\n');
  const many = (n: number, over?: (i: number) => Partial<Record<string, string>>) =>
    Array.from({ length: n }, (_, i) => row(i, over?.(i)));

  // 0,0 is a real place in the Gulf of Guinea, ~5300 km from any circuit. One such
  // sample stretched the compare axis from 2.7 km to 10 700 km and allocated a
  // 5.4M-element grid per channel per lap.
  it('holds the last known fix through a row with no GPS fix', () => {
    const p = parseRaceboxCsv(csv(many(60, (i) => (i === 30 ? { Latitude: '', Longitude: '' } : {}))));
    expect(p.noFix).toBe(1);
    expect(p.ch.lat[30]).toBeCloseTo(47.9012345, 6);
    expect(p.ch.lon[30]).toBeCloseTo(7.2345678, 6);
    // and the sample itself survives, so the time base and speed stay intact
    expect(p.n).toBe(60);
    expect(p.ch.spd[30]).toBe(30);
  });

  it('treats an explicit 0,0 coordinate as a missing fix, not as a position', () => {
    const p = parseRaceboxCsv(csv(many(60, (i) => (i === 30 ? { Latitude: '0', Longitude: '0' } : {}))));
    expect(p.ch.lat[30]).toBeCloseTo(47.9012345, 6);
    expect(Math.max(...p.ch.lat) - Math.min(...p.ch.lat)).toBeLessThan(0.001);
  });

  it('back-fills leading rows that had no fix to hold', () => {
    const p = parseRaceboxCsv(csv(many(60, (i) => (i < 5 ? { Latitude: '', Longitude: '' } : {}))));
    expect(p.ch.lat[0]).toBeCloseTo(47.9012345, 6);
    expect(p.ch.lat.every((v) => v !== 0)).toBe(true);
  });

  it('refuses a session with no fix anywhere rather than projecting the null island', () => {
    expect(() => parseRaceboxCsv(csv(many(60, () => ({ Latitude: '', Longitude: '' })))))
      .toThrow(/no gps fix/i);
  });

  // Without `Time`, Date.parse(undefined) is NaN for every row, so all rows were
  // skipped and a 23752-sample file was reported as "under one second".
  it('names the missing column instead of blaming the session length', () => {
    const noTime = csv(many(60)).replace('Record,Time,', 'Record,Timestamp,');
    expect(() => parseRaceboxCsv(noTime)).toThrow(/Time/);
    expect(() => parseRaceboxCsv(noTime)).not.toThrow(/too short/i);

    const noLat = ['Track,Test', 'Record,Time,Longitude,Speed (m/s),Lap,Heading,LeanAngle (deg)',
      ...many(60).map((r) => { const c = r.split(','); return [c[0], c[1], c[3], c[4], c[5], c[6], c[7]].join(','); })].join('\n');
    expect(() => parseRaceboxCsv(noLat)).toThrow(/Latitude/);
  });

  // Every derivative divides by t[i+3] − t[i−3] and guards with `dt > 0`, so a
  // repeated timestamp does not degrade the reading, it fabricates a 0 g plateau.
  it('drops out-of-order and duplicate timestamps to keep the clock strictly increasing', () => {
    const rows = many(60);
    rows[30] = row(20); // a duplicate of an earlier instant
    rows[31] = row(10); // and a jump backwards
    const p = parseRaceboxCsv(csv(rows));
    expect(p.dropped).toBe(2);
    expect(p.n).toBe(58);
    for (let i = 1; i < p.n; i++) expect(p.ch.t[i]).toBeGreaterThan(p.ch.t[i - 1]);
  });

  it('drops a truncated row rather than reading a shifted column out of it', () => {
    const rows = many(60);
    rows[10] = '11,2026-06-06T10:00:00.400Z,47.9,7.2'; // missing the last four cells
    const p = parseRaceboxCsv(csv(rows));
    expect(p.dropped).toBe(1);
    expect(p.n).toBe(59);
  });
});
