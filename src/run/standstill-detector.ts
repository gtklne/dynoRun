import { kmhToMps } from '@/shared/units';
import { DEFAULT_STANDSTILL_CONFIG, type StandstillConfig } from './types';

interface Sample {
  t_ms: number;
  speed_mps: number;
}

export interface StandstillProgress {
  /** The vehicle has moved, so a standstill is now allowed to end the session. */
  armed: boolean;
  stopped: boolean;
  /** How long it has been continuously stopped. 0 while moving. */
  elapsed_ms: number;
  /** Until auto-finish. Clamped at 0. */
  remaining_ms: number;
}

/**
 * Ends a hands-free session once the rider has parked, so pull detection has
 * already run by the time the phone is picked up again.
 *
 * Arming is what separates "parked at the end of the ride" from "parked at the
 * start": a session begun in the garage sits at 0 km/h for as long as it takes
 * the rider to put gloves on, and must never finish itself over that.
 *
 * All timing comes from sample `t_ms`, never from a wall clock, because `t_ms`
 * is relative to `performance.now()` at sensor start and so has no relation to
 * `Date.now()`.
 */
export class StandstillDetector {
  private readonly config: StandstillConfig;
  private readonly stoppedMps: number;
  private readonly armMps: number;
  private armed = false;
  private firstStoppedMs: number | null = null;
  private lastStoppedMs = 0;

  constructor(config: Partial<StandstillConfig> = {}) {
    this.config = { ...DEFAULT_STANDSTILL_CONFIG, ...config };
    this.stoppedMps = kmhToMps(this.config.stopped_speed_kmh);
    this.armMps = kmhToMps(this.config.arm_speed_kmh);
  }

  push(sample: Sample): void {
    // Latched, never cleared by a later slow sample: a ride that reached speed
    // has happened, whatever the vehicle does afterwards.
    if (sample.speed_mps >= this.armMps) this.armed = true;

    if (sample.speed_mps > this.stoppedMps) {
      this.firstStoppedMs = null;
      return;
    }
    if (this.firstStoppedMs === null) this.firstStoppedMs = sample.t_ms;
    this.lastStoppedMs = sample.t_ms;
  }

  progress(): StandstillProgress {
    const first = this.firstStoppedMs;
    const elapsed_ms = first === null ? 0 : this.lastStoppedMs - first;
    return {
      armed: this.armed,
      stopped: first !== null,
      elapsed_ms,
      // Unarmed, no standstill can finish the session, so nothing is counting
      // down and reporting a shrinking window would be a lie to the UI.
      remaining_ms: this.armed ? Math.max(0, this.config.standstill_ms - elapsed_ms) : this.config.standstill_ms,
    };
  }

  /** Armed, and continuously stopped for the full window. Pure query: the caller must guard against firing twice. */
  check(): boolean {
    if (!this.armed) return false;
    const first = this.firstStoppedMs;
    if (first === null) return false;
    return this.lastStoppedMs - first >= this.config.standstill_ms;
  }

  reset(): void {
    this.armed = false;
    this.firstStoppedMs = null;
    this.lastStoppedMs = 0;
  }
}
