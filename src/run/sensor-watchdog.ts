/**
 * How often the backstop looks at the recording. Coarse on purpose: it only
 * has to catch a stall, not time anything.
 */
export const DEFAULT_WATCHDOG_TICK_MS = 2_000;

/**
 * Wall-clock silence from the sensor before a recording gives up and closes
 * with whatever it has. Generously longer than any real gap at 1 Hz GPS.
 */
export const DEFAULT_SENSOR_STALL_MS = 30_000;

export interface SensorWatchdogOptions {
  maxDurationMs: number;
  stallMs?: number;
  tickMs?: number;
  onMaxDuration: () => void;
  onStall: () => void;
}

/**
 * Wall-clock backstop for a hands-free recording.
 *
 * Every other way a hands-free recording ends is driven by an incoming sample:
 * the standstill detector, the max-duration check, the rider's own hold
 * button. So a sensor that simply stops delivering (permission revoked
 * mid-ride, or the webview suspended after a wake lock was denied) would leave
 * the recording running forever, and the only escape would be a button press.
 * That is precisely the thing hands-free promises the rider will not need,
 * which is why this timer runs off `Date.now()` and not off sample `t_ms`.
 *
 * Firing is latched: the owner is expected to `stop()` in response, and a
 * second callback while it tears down would be noise.
 */
export class SensorWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedMs = 0;
  private lastBeatMs = 0;
  private fired = false;
  private readonly stallMs: number;
  private readonly tickMs: number;

  constructor(private readonly opts: SensorWatchdogOptions) {
    this.stallMs = opts.stallMs ?? DEFAULT_SENSOR_STALL_MS;
    this.tickMs = opts.tickMs ?? DEFAULT_WATCHDOG_TICK_MS;
  }

  start(): void {
    this.stop();
    this.fired = false;
    this.startedMs = Date.now();
    this.lastBeatMs = this.startedMs;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  /** Every arriving sample is proof the sensor is still alive. */
  beat(): void {
    this.lastBeatMs = Date.now();
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (this.fired) return;
    const now = Date.now();
    if (now - this.startedMs >= this.opts.maxDurationMs) {
      this.fired = true;
      this.opts.onMaxDuration();
      return;
    }
    if (now - this.lastBeatMs >= this.stallMs) {
      this.fired = true;
      this.opts.onStall();
    }
  }
}
