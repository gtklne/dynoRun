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

  /**
   * Live view of the window for the UI. Reports truthfully even when the
   * reading could never be captured, so the panel can explain why instead of
   * showing a progress bar that fills and then sits there: standing still is
   * perfectly stable, so without `mean_speed_kmh` the UI cannot tell a good
   * hold from a parked bike.
   */
  progress(now_ms: number): { elapsed_ms: number; speed_delta_kmh: number; mean_speed_kmh: number } {
    const cutoff = now_ms - this.window.duration_ms;
    const recent = this.buffer.filter((s) => s.t_ms >= cutoff);
    if (recent.length < 2) return { elapsed_ms: 0, speed_delta_kmh: 0, mean_speed_kmh: 0 };
    const speedsKmh = recent.map((s) => mpsToKmh(s.speed_mps));
    const min = Math.min(...speedsKmh);
    const max = Math.max(...speedsKmh);
    const span = recent[recent.length - 1].t_ms - recent[0].t_ms;
    const mean_speed_kmh = mpsToKmh(recent.reduce((a, s) => a + s.speed_mps, 0) / recent.length);
    return { elapsed_ms: span, speed_delta_kmh: max - min, mean_speed_kmh };
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

    const avgKmh = mpsToKmh(recent.reduce((a, s) => a + s.speed_mps, 0) / recent.length);
    // The floor goes on the mean rather than on the slowest sample, for two
    // reasons. The mean is the number this method hands back and the wizard
    // posts, so guarding it makes the check a precondition on the value that
    // leaves here. And the delta check above already bounds the window's
    // spread, so no single near-zero reading can drag the mean under the floor
    // without failing that check first; keying on the minimum would instead
    // make the effective floor min_speed_kmh + max_speed_delta_kmh, coupling
    // two settings that are meant to be independent.
    if (avgKmh < this.window.min_speed_kmh) return null;
    return { captured_speed_kmh: avgKmh };
  }
}
