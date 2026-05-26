export type PowerUnit = 'kW' | 'hp' | 'PS';

const HP_PER_KW = 1.341022;
const PS_PER_KW = 1.359622;

export function convertPower(kw: number, unit: PowerUnit): number {
  switch (unit) {
    case 'kW': return kw;
    case 'hp': return kw * HP_PER_KW;
    case 'PS': return kw * PS_PER_KW;
  }
}

export interface FormatPowerOptions {
  decimals?: number;
  unitSuffix?: boolean;
}

export function formatPower(
  kw: number | null | undefined,
  unit: PowerUnit,
  opts: FormatPowerOptions = {},
): string {
  if (kw == null || !isFinite(kw)) return '—';
  const decimals = opts.decimals ?? (unit === 'kW' ? 1 : 0);
  const value = convertPower(kw, unit).toFixed(decimals);
  return opts.unitSuffix === false ? value : `${value} ${unit}`;
}

export function powerUnitLabel(unit: PowerUnit): string {
  return unit;
}

export function isPowerUnit(v: string): v is PowerUnit {
  return v === 'kW' || v === 'hp' || v === 'PS';
}
