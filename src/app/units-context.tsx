import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { formatPower, isPowerUnit, type FormatPowerOptions, type PowerUnit } from '@/shared/format-power';

const STORAGE_KEY = 'dynorun:units';
const DEFAULT_UNIT: PowerUnit = 'kW';

interface UnitsContextValue {
  unit: PowerUnit;
  setUnit(u: PowerUnit): void;
  format(kw: number | null | undefined, opts?: FormatPowerOptions): string;
  label: string;
}

const UnitsContext = createContext<UnitsContextValue | null>(null);

function readInitial(): PowerUnit {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && isPowerUnit(v)) return v;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_UNIT;
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<PowerUnit>(readInitial);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, unit); } catch { /* noop */ }
  }, [unit]);

  const setUnit = useCallback((u: PowerUnit) => setUnitState(u), []);
  const format = useCallback((kw: number | null | undefined, opts?: FormatPowerOptions) => formatPower(kw, unit, opts), [unit]);

  return (
    <UnitsContext.Provider value={{ unit, setUnit, format, label: unit }}>
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits(): UnitsContextValue {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error('useUnits must be used inside UnitsProvider');
  return ctx;
}
