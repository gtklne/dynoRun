import { mpsToKmh } from '@/shared/units';
import type { StabilityWindow } from './types';

interface Sample {
  t_ms: number;
  speed_mps: number;
}

export interface StabilityResult {
  captured_speed_kmh: number;
}

export class CalibrationStabilityDetector {
  private buffer: Sample[] = [];

  constructor(private readonly window: StabilityWindow) {}

  push(sample: Sample): void {
    this.buffer.push(sample);
  }

  reset(): void {
    this.buffer = [];
  }

  check(now_ms: number): StabilityResult | null {
    const cutoff = now_ms - this.window.duration_ms;
    // Need at least one anchor sample strictly before the cutoff
    const hasAnchor = this.buffer.some((s) => s.t_ms < cutoff);
    if (!hasAnchor) return null;

    const recent = this.buffer.filter((s) => s.t_ms >= cutoff);
    if (recent.length < 2) return null;

    const speedsKmh = recent.map((s) => mpsToKmh(s.speed_mps));
    const min = Math.min(...speedsKmh);
    const max = Math.max(...speedsKmh);

    if (max - min > this.window.max_speed_delta_kmh) return null;

    const avgMps = recent.reduce((a, s) => a + s.speed_mps, 0) / recent.length;
    return { captured_speed_kmh: mpsToKmh(avgMps) };
  }
}
