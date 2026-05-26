import type { AutoStopConfig } from './types';

interface Sample {
  t_ms: number;
  speed_mps: number;
}

const MIN_AGE_FRACTION = 0.8;

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
    if (this.buffer.length < 2) return false;
    const last = this.buffer[this.buffer.length - 1];
    // Find the most recent sample that's at least minAge older than now.
    // Using a fraction of the window tolerates GPS jitter at 1 Hz, where
    // consecutive samples are ~1000ms ± a few ms apart.
    const minAge = this.config.zero_accel_window_ms * MIN_AGE_FRACTION;
    let baseline: Sample | null = null;
    for (let i = this.buffer.length - 2; i >= 0; i--) {
      if (now_ms - this.buffer[i].t_ms >= minAge) {
        baseline = this.buffer[i];
        break;
      }
    }
    if (!baseline) return false;
    return last.speed_mps <= baseline.speed_mps;
  }
}
