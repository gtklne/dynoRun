import { describe, it, expect } from 'vitest';
import type uPlot from 'uplot';
import { legendValue, themedAxis } from '@/ui/components/uplot-theme';

// uPlot calls the value formatter with the plot instance first; it's unused here.
const u = undefined as unknown as uPlot;

describe('legendValue', () => {
  it('rounds to one decimal and appends the unit by default', () => {
    expect(legendValue('kW')(u, 117.23412)).toBe('117.2 kW');
  });

  it('honours a custom decimal count', () => {
    expect(legendValue('hp', 0)(u, 117.23412)).toBe('117 hp');
    expect(legendValue('RPM', 0)(u, 3417.8)).toBe('3418 RPM');
  });

  it('formats negative values (e.g. deltas) with the unit', () => {
    expect(legendValue('Nm', 1)(u, -12.34)).toBe('-12.3 Nm');
  });

  it('renders an em dash when the cursor is off the data', () => {
    expect(legendValue('kW')(u, null)).toBe('—');
  });

  it('renders an em dash for non-finite values', () => {
    expect(legendValue('kW')(u, NaN)).toBe('—');
    expect(legendValue('kW')(u, Infinity)).toBe('—');
  });
});

describe('themedAxis decimals', () => {
  type TickFmt = (self: uPlot, splits: number[]) => string[];

  it('formats numeric tick labels to the requested decimals', () => {
    const fmt = themedAxis({ decimals: 0 }).values as TickFmt;
    expect(fmt(u, [80, 90, 100.4])).toEqual(['80', '90', '100']);
  });

  it('keeps one decimal (e.g. for delta axes) including negatives', () => {
    const fmt = themedAxis({ decimals: 1 }).values as TickFmt;
    expect(fmt(u, [-4, 0, 4])).toEqual(['-4.0', '0.0', '4.0']);
  });

  it('leaves ticks to uPlot when decimals is unset', () => {
    expect(themedAxis({ label: 'RPM' }).values).toBeUndefined();
  });
});
