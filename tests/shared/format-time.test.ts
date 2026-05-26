import { describe, expect, it } from 'vitest';
import { formatRelativeTime, formatShortDateTime, formatDurationMs } from '@/shared/format-time';

const NOW = new Date('2026-05-26T15:30:00.000Z');

describe('formatRelativeTime', () => {
  it('renders just now for very recent', () => {
    expect(formatRelativeTime('2026-05-26T15:29:58.000Z', NOW)).toBe('Just now');
  });

  it('renders seconds', () => {
    expect(formatRelativeTime('2026-05-26T15:29:30.000Z', NOW)).toBe('30s ago');
  });

  it('renders minutes', () => {
    expect(formatRelativeTime('2026-05-26T15:20:00.000Z', NOW)).toBe('10 min ago');
  });

  it('renders hours', () => {
    expect(formatRelativeTime('2026-05-26T13:30:00.000Z', NOW)).toBe('2 h ago');
  });

  it('renders days under a week', () => {
    expect(formatRelativeTime('2026-05-24T15:30:00.000Z', NOW)).toBe('2 d ago');
  });

  it('renders absolute date same year past a week', () => {
    expect(formatRelativeTime('2026-04-10T15:30:00.000Z', NOW)).toBe('Apr 10');
  });

  it('renders absolute date with year if different', () => {
    expect(formatRelativeTime('2025-12-25T15:30:00.000Z', NOW)).toBe('Dec 25, 2025');
  });

  it('returns dash for invalid date', () => {
    expect(formatRelativeTime('not a date', NOW)).toBe('—');
  });
});

describe('formatShortDateTime', () => {
  it('renders month + day + hh:mm', () => {
    expect(formatShortDateTime('2026-05-26T15:30:00.000Z')).toMatch(/May 26 · \d{2}:\d{2}/);
  });
});

describe('formatDurationMs', () => {
  it('formats sub-minute', () => {
    expect(formatDurationMs(15_000)).toBe('15s');
  });

  it('formats minute-plus', () => {
    expect(formatDurationMs(95_000)).toBe('1m 35s');
  });

  it('returns dash for invalid', () => {
    expect(formatDurationMs(-1)).toBe('—');
    expect(formatDurationMs(Number.NaN)).toBe('—');
  });
});
