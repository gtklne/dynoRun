import { isNative } from './platform';

interface MaybeWakeLockSentinel {
  release(): Promise<void>;
}

interface MaybeWakeLockNavigator {
  wakeLock?: {
    request(type: 'screen'): Promise<MaybeWakeLockSentinel>;
  };
}

export class WakeLock {
  private sentinel: MaybeWakeLockSentinel | null = null;
  private nativeHeld = false;

  get supported(): boolean {
    if (isNative()) return true;
    return typeof navigator !== 'undefined' && !!(navigator as MaybeWakeLockNavigator).wakeLock;
  }

  get held(): boolean {
    return this.nativeHeld || this.sentinel !== null;
  }

  async acquire(): Promise<void> {
    if (isNative()) {
      const { KeepAwake } = await import('@capacitor-community/keep-awake');
      await KeepAwake.keepAwake();
      this.nativeHeld = true;
      return;
    }
    if (!this.supported) return;
    const nav = navigator as MaybeWakeLockNavigator;
    this.sentinel = (await nav.wakeLock!.request('screen')) ?? null;
  }

  async release(): Promise<void> {
    if (this.nativeHeld) {
      const { KeepAwake } = await import('@capacitor-community/keep-awake');
      await KeepAwake.allowSleep();
      this.nativeHeld = false;
      return;
    }
    if (this.sentinel) {
      await this.sentinel.release();
      this.sentinel = null;
    }
  }
}
