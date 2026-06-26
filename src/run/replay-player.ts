import type { RawGpsFix } from '@/sensors/recording';
import { fixSpeedMps, fixQuality } from '@/sensors/recording';

export interface ReplaySpeedSample {
  /** The fix's own recording-relative timestamp (rate-independent). */
  t_ms: number;
  speed_mps: number;
  speed_kmh: number;
  accuracy_m: number | null;
  altitude_m: number | null;
  heading_deg: number | null;
  quality: number;
}

export interface ReplayProgress {
  t_ms: number;
  duration_ms: number;
  playing: boolean;
  rate: number;
}

export interface ReplayPlayerOptions {
  /** Time-sorted GPS fixes from the recording. */
  fixes: RawGpsFix[];
  durationMs: number;
  rate?: number;
  /** Forward-playback emit — drives the live chart and readouts. */
  onSample: (s: ReplaySpeedSample) => void;
  /** A jump (seek/restart): the screen should reset chart + rings, then show the snapshot. */
  onSeeked: (t_ms: number, snapshot: ReplaySpeedSample | null) => void;
  /** Once per frame (and on transport changes) — drives the scrubber. */
  onProgress: (p: ReplayProgress) => void;
  /** Fires once when the clock reaches the end. */
  onEnded: () => void;
}

const MIN_RATE = 0.25;
const MAX_RATE = 8;
// Cap per-frame advance so a backgrounded tab (rAF paused) doesn't fast-forward on resume.
const MAX_FRAME_DT_MS = 250;

function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, rate));
}

/**
 * Real-time recording playback driven by a single requestAnimationFrame virtual
 * clock — `virtualTimeMs += dt * rate`, draining fixes from a cursor as the clock
 * passes their `t_ms`. A single clock (vs per-fix setTimeout) makes variable speed
 * and seek O(1) instead of cancel-and-reschedule-N-timers.
 */
export class ReplayPlayer {
  private readonly fixes: RawGpsFix[];
  private readonly duration: number;
  private rate: number;
  private virtualTimeMs = 0;
  private cursor = 0; // index of the next un-emitted fix
  private raf: number | null = null;
  private lastFrameMs = 0;
  private endedFired = false;
  private disposed = false;

  constructor(private readonly opts: ReplayPlayerOptions) {
    this.fixes = opts.fixes;
    this.duration = Math.max(0, opts.durationMs);
    this.rate = clampRate(opts.rate ?? 1);
  }

  play(): void {
    if (this.disposed || this.raf !== null) return;
    // Resume-from-end → replay from the top.
    if (this.virtualTimeMs >= this.duration && this.cursor >= this.fixes.length) {
      this.resetToStart();
    }
    this.lastFrameMs = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.emitProgress(true);
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    if (!this.disposed) this.emitProgress(false);
  }

  restart(): void {
    const wasPlaying = this.raf !== null;
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.resetToStart();
    this.opts.onSeeked(0, this.fixes.length > 0 ? this.buildSample(0) : null);
    if (wasPlaying) this.play();
    else this.emitProgress(false);
  }

  seek(tMs: number): void {
    if (this.disposed) return;
    const target = Math.min(this.duration, Math.max(0, tMs));
    this.virtualTimeMs = target;
    // Next fix to emit is the first one strictly after the target.
    let cursor = 0;
    while (cursor < this.fixes.length && this.fixes[cursor].t_ms <= target) cursor++;
    this.cursor = cursor;
    this.endedFired = false;
    const snapshotIndex = cursor - 1;
    this.opts.onSeeked(target, snapshotIndex >= 0 ? this.buildSample(snapshotIndex) : null);
    this.emitProgress(this.raf !== null);
  }

  setRate(rate: number): void {
    this.rate = clampRate(rate);
    this.emitProgress(this.raf !== null);
  }

  getProgress(): ReplayProgress {
    return {
      t_ms: this.virtualTimeMs,
      duration_ms: this.duration,
      playing: this.raf !== null,
      rate: this.rate,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  private resetToStart(): void {
    this.virtualTimeMs = 0;
    this.cursor = 0;
    this.endedFired = false;
  }

  private buildSample(index: number): ReplaySpeedSample {
    const cur = this.fixes[index];
    const prev = index > 0 ? this.fixes[index - 1] : null;
    const speed_mps = fixSpeedMps(prev, cur);
    return {
      t_ms: cur.t_ms,
      speed_mps,
      speed_kmh: speed_mps * 3.6,
      accuracy_m: cur.accuracy_m,
      altitude_m: cur.altitude_m,
      heading_deg: cur.heading_deg,
      quality: fixQuality(cur),
    };
  }

  private emitProgress(playing: boolean): void {
    this.opts.onProgress({
      t_ms: this.virtualTimeMs,
      duration_ms: this.duration,
      playing,
      rate: this.rate,
    });
  }

  private readonly tick = (now: number): void => {
    if (this.disposed) return;
    const dt = Math.min(now - this.lastFrameMs, MAX_FRAME_DT_MS);
    this.lastFrameMs = now;
    this.virtualTimeMs = Math.min(this.duration, this.virtualTimeMs + dt * this.rate);

    while (this.cursor < this.fixes.length && this.fixes[this.cursor].t_ms <= this.virtualTimeMs) {
      this.opts.onSample(this.buildSample(this.cursor));
      this.cursor++;
    }

    this.emitProgress(true);

    if (this.virtualTimeMs >= this.duration && this.cursor >= this.fixes.length) {
      this.stop();
      if (!this.endedFired) {
        this.endedFired = true;
        this.opts.onEnded();
      }
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
