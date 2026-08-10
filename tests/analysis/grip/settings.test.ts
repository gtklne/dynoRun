import { describe, expect, it } from 'vitest';
import { analyzeGripSession } from '@/analysis/grip/analyze';
import { parseRaceboxCsv } from '@/analysis/grip/parse-racebox';
import {
  DEFAULT_GRIP_SETTINGS,
  GRIP_SETTINGS_SCHEMA,
  RECOMPUTE_KEYS,
  sanitizeGripSettings,
} from '@/analysis/grip/settings';
import { BASE_PACE, circuitCsv, simulateSession } from './synthetic-circuit';

const DEFS = GRIP_SETTINGS_SCHEMA.flatMap((g) => g.items);

// sanitizeGripSettings is the only barrier between arbitrary grip_sessions.settings
// jsonb and the pipeline, and it had no test: dropping its clamp left all 392 tests
// green while `{"speedSmooth": -5}` made every one of 23752 comb samples NaN
// (movAvg's window half-width goes negative, its running count reaches zero).
describe('sanitizeGripSettings', () => {
  it('clamps every key to its declared bounds', () => {
    for (const d of DEFS) {
      expect(sanitizeGripSettings({ [d.key]: d.min - 1000 })[d.key]).toBe(d.min);
      expect(sanitizeGripSettings({ [d.key]: d.max + 1000 })[d.key]).toBe(d.max);
      // an in-range value survives untouched: the rider's tuning is not lost
      const mid = (d.min + d.max) / 2;
      expect(sanitizeGripSettings({ [d.key]: mid })[d.key]).toBe(mid);
    }
  });

  it('falls back to the default for anything that is not a finite number', () => {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, '9', {}, [], true]) {
      for (const d of DEFS) {
        expect(sanitizeGripSettings({ [d.key]: bad })[d.key]).toBe(d.def);
      }
    }
    expect(sanitizeGripSettings(null)).toEqual(DEFAULT_GRIP_SETTINGS);
    expect(sanitizeGripSettings('nope')).toEqual(DEFAULT_GRIP_SETTINGS);
    expect(sanitizeGripSettings([])).toEqual(DEFAULT_GRIP_SETTINGS);
  });

  it('drops unknown keys instead of passing them through', () => {
    const out = sanitizeGripSettings({ speedSmooth: 9, somethingElse: 42 });
    expect(out).toEqual({ ...DEFAULT_GRIP_SETTINGS, speedSmooth: 9 });
    expect('somethingElse' in out).toBe(false);
  });

  // the reason the clamp exists at all
  it('keeps the pipeline finite for hostile stored settings', () => {
    const parsed = parseRaceboxCsv(circuitCsv(simulateSession([BASE_PACE, BASE_PACE], 1)));
    const hostile = sanitizeGripSettings({ speedSmooth: -5, tau: 1e9, envMinSpeed: -100, mergeGap: NaN });
    const a = analyzeGripSession(parsed, hostile);
    expect(Array.from(a.comb).every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(a.sessionScore)).toBe(true);
    expect(a.laps.length).toBeGreaterThan(0);
  });

  it('declares exactly the keys the recompute signature watches', () => {
    // RECOMPUTE_KEYS drives the memo that re-derives channels; a key marked
    // 'recompute' but missing here would silently never take effect
    const declared = DEFS.filter((d) => d.apply === 'recompute').map((d) => d.key);
    expect([...RECOMPUTE_KEYS].sort()).toEqual([...declared].sort());
  });
});
