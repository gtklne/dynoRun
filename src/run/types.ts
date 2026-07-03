import type { UUID } from '@/shared/types';
import type { DetectedPull } from '@/analysis/pull-detection';
import type { AnalyzedRun, RawSpeedSample } from '@/analysis/types';

export type CalibrationState =
  | { kind: 'idle' }
  | { kind: 'measuring'; gear_label: string; user_rpm: number; started_at_ms: number }
  | { kind: 'stable'; gear_label: string; user_rpm: number; captured_speed_kmh: number }
  | { kind: 'confirmed'; calibration_id: UUID };

export type RunState =
  | { kind: 'idle' }
  | { kind: 'ready'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { kind: 'running'; run_id: UUID; started_t_ms: number }
  | { kind: 'analyzing'; run_id: UUID }
  | { kind: 'reviewing'; run_id: UUID }
  | { kind: 'saved'; run_id: UUID }
  | { kind: 'aborted'; run_id: UUID };

export interface StabilityWindow {
  duration_ms: number;
  max_speed_delta_kmh: number;
}

export const DEFAULT_STABILITY_WINDOW: StabilityWindow = {
  duration_ms: 5000,
  max_speed_delta_kmh: 1.0,
};

export interface AutoStopConfig {
  zero_accel_window_ms: number;
}

export const DEFAULT_AUTO_STOP_CONFIG: AutoStopConfig = {
  zero_accel_window_ms: 1000,
};

/**
 * One detected pull inside a hands-free session, ready for review: the raw
 * sample slice (t_ms rebased to 0) plus its in-memory analysis. `analysis`
 * is null when the pipeline could not produce a curve for the slice.
 */
export interface SessionPull {
  pull: DetectedPull;
  samples: RawSpeedSample[];
  analysis: AnalyzedRun | null;
}

export type SessionState =
  | { kind: 'idle' }
  | { kind: 'ready'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { kind: 'recording'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { kind: 'detecting'; vehicle_id: UUID; calibration_id: UUID; gear_label: string }
  | { kind: 'reviewing'; vehicle_id: UUID; calibration_id: UUID; gear_label: string; pulls: SessionPull[] }
  | { kind: 'saving'; vehicle_id: UUID; calibration_id: UUID; gear_label: string; pulls: SessionPull[] }
  | { kind: 'saved'; vehicle_id: UUID; run_ids: UUID[] };

/** Hands-free sessions self-terminate after this long as a runaway guard. */
export const MAX_SESSION_DURATION_MS = 30 * 60_000;
