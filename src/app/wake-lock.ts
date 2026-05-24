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

  get supported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as MaybeWakeLockNavigator).wakeLock;
  }

  get held(): boolean {
    return this.sentinel !== null;
  }

  async acquire(): Promise<void> {
    if (!this.supported) return;
    const nav = navigator as MaybeWakeLockNavigator;
    this.sentinel = (await nav.wakeLock!.request('screen')) ?? null;
  }

  async release(): Promise<void> {
    if (this.sentinel) {
      await this.sentinel.release();
      this.sentinel = null;
    }
  }
}
