export type Platform = 'web' | 'ios' | 'android';

interface MaybeCapacitor {
  Capacitor?: { getPlatform(): string };
}

export function getPlatform(): Platform {
  const g = globalThis as unknown as MaybeCapacitor;
  if (g.Capacitor && typeof g.Capacitor.getPlatform === 'function') {
    const p = g.Capacitor.getPlatform();
    if (p === 'ios' || p === 'android' || p === 'web') return p;
  }
  return 'web';
}

export function isNative(): boolean {
  const p = getPlatform();
  return p === 'ios' || p === 'android';
}
