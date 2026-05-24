import type { AutoStopConfig } from './types';

interface Sample {
  t_ms: number;
  speed_mps: number;
}

export class AutoStopDetector {
  private buffer: Sample[] = [];

  constructor(private readonly config: AutoStopConfig) {}

  push(sample: Sample): void {
    this.buffer.push(sample);
    const cutoff = sample.t_ms - 2 * this.config.zero_accel_window_ms;
    while (this.buffer.length > 0 && this.buffer[0].t_ms < cutoff) {
      this.buffer.shift();
    }
  }

  reset(): void {
    this.buffer = [];
  }

  check(now_ms: number): boolean {
    const cutoff = now_ms - this.config.zero_accel_window_ms;
    const window = this.buffer.filter((s) => s.t_ms >= cutoff);
    if (window.length < 2) return false;
    const first = window[0];
    const last = window[window.length - 1];
    if (last.t_ms - first.t_ms < this.config.zero_accel_window_ms) return false;
    // Non-positive acceleration over the window: last speed <= first speed
    return last.speed_mps <= first.speed_mps;
  }
}
