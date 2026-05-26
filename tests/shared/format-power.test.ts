import { describe, expect, it } from 'vitest';
import { convertPower, formatPower, isPowerUnit, powerUnitLabel } from '@/shared/format-power';

describe('convertPower', () => {
  it('returns kw unchanged for kW', () => {
    expect(convertPower(100, 'kW')).toBe(100);
  });

  it('converts kW to hp', () => {
    expect(convertPower(100, 'hp')).toBeCloseTo(134.1022, 3);
  });

  it('converts kW to PS', () => {
    expect(convertPower(100, 'PS')).toBeCloseTo(135.9622, 3);
  });

  it('handles zero', () => {
    for (const u of ['kW','hp','PS'] as const) expect(convertPower(0, u)).toBe(0);
  });
});

describe('formatPower', () => {
  it('renders kW with one decimal by default', () => {
    expect(formatPower(123.456, 'kW')).toBe('123.5 kW');
  });

  it('renders hp with zero decimals by default', () => {
    expect(formatPower(100, 'hp')).toBe('134 hp');
  });

  it('renders PS with zero decimals by default', () => {
    expect(formatPower(100, 'PS')).toBe('136 PS');
  });

  it('returns em-dash for null/undefined', () => {
    expect(formatPower(null, 'kW')).toBe('—');
    expect(formatPower(undefined, 'hp')).toBe('—');
  });

  it('honors custom decimals', () => {
    expect(formatPower(100, 'hp', { decimals: 2 })).toBe('134.10 hp');
  });

  it('omits suffix when asked', () => {
    expect(formatPower(100, 'hp', { unitSuffix: false })).toBe('134');
  });

  it('rejects non-finite kw', () => {
    expect(formatPower(Number.NaN, 'kW')).toBe('—');
    expect(formatPower(Number.POSITIVE_INFINITY, 'kW')).toBe('—');
  });
});

describe('powerUnitLabel', () => {
  it('returns the unit verbatim', () => {
    expect(powerUnitLabel('kW')).toBe('kW');
    expect(powerUnitLabel('hp')).toBe('hp');
    expect(powerUnitLabel('PS')).toBe('PS');
  });
});

describe('isPowerUnit', () => {
  it('accepts kW/hp/PS', () => {
    expect(isPowerUnit('kW')).toBe(true);
    expect(isPowerUnit('hp')).toBe(true);
    expect(isPowerUnit('PS')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isPowerUnit('KW')).toBe(false);
    expect(isPowerUnit('Hp')).toBe(false);
    expect(isPowerUnit('')).toBe(false);
    expect(isPowerUnit('horsepower')).toBe(false);
  });
});
