function safeVibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch { /* noop */ }
}

export function pulseStart(): void {
  safeVibrate(60);
}

export function pulseStop(): void {
  safeVibrate([50, 60, 50, 60, 80]);
}

export function pulseTick(): void {
  safeVibrate(20);
}
