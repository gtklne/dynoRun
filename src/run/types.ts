import type { UUID } from '@/shared/types';
import type { DetectedPull } from '@/analysis/pull-detection';
import type { DetectedPlateau } from '@/analysis/plateau-detection';
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
  /**
   * Standing still is perfectly stable, so without a floor the wizard captures
   * a rock-steady 0 km/h five seconds after the rider taps "Start measurement"
   * in the garage, latches to `stable`, and stops listening; the POST then
   * fails with a 400 because the server rejects `speed_kmh <= 0`.
   */
  min_speed_kmh: number;
}

export const DEFAULT_STABILITY_WINDOW: StabilityWindow = {
  duration_ms: 5000,
  max_speed_delta_kmh: 1.0,
  /**
   * Safe because it only excludes standstill and creeping: a real calibration
   * point is a gear held at a usable RPM, and any gear that tops out at
   * 10 km/h would have the engine at idle, which is not a point anyone
   * calibrates against.
   */
  min_speed_kmh: 10,
};

export interface AutoStopConfig {
  zero_accel_window_ms: number;
}

export const DEFAULT_AUTO_STOP_CONFIG: AutoStopConfig = {
  zero_accel_window_ms: 1000,
};

export interface StandstillConfig {
  /**
   * At or below this the vehicle counts as stopped. It can be this tight
   * because GNSS derives speed from the Doppler shift of the carrier rather
   * than by differencing positions, so a stationary phone reads near zero
   * instead of jittering with position noise. Haversine differencing, which
   * does jitter, is only the fallback for platforms reporting no speed at all
   * (see the iOS -1 case in the sensors layer).
   */
  stopped_speed_kmh: number;
  /** Continuous standstill required before the session finishes itself. */
  standstill_ms: number;
  /** Speed the session must have exceeded before a standstill can end it. */
  arm_speed_kmh: number;
}

export const DEFAULT_STANDSTILL_CONFIG: StandstillConfig = {
  stopped_speed_kmh: 5,
  standstill_ms: 20_000,
  arm_speed_kmh: 25,
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

/**
 * Physically plausible rollout band, in metres of wheel travel per crankshaft
 * revolution. Deliberately wide: a car in first sits near 0.11 and a car in top
 * near 1.1, so this only ever catches nonsense.
 */
export const PLAUSIBLE_ROLLOUT_M_PER_REV = { min: 0.05, max: 1.5 };

/**
 * One steady-speed hold found in a hands-free calibration recording, ready for
 * review: the plateau, the raw slice behind it, and the rollout it would imply
 * for the RPM the rider said they were holding.
 */
export interface CalibrationCandidate {
  plateau: DetectedPlateau;
  samples: RawSpeedSample[];
  rollout_m_per_rev: number;
  /**
   * Inside PLAUSIBLE_ROLLOUT_M_PER_REV. A sanity check only, and the UI must
   * not imply otherwise: a hold in the WRONG gear lands comfortably inside the
   * band, so this rules out nonsense, never a wrong pick. Picking the right
   * hold is the rider's job, which is why every candidate is shown.
   */
  plausible: boolean;
}

export type CalibrationSessionState =
  | { kind: 'idle' }
  | { kind: 'ready'; vehicle_id: UUID; gear_label: string; user_rpm: number }
  | { kind: 'recording'; vehicle_id: UUID; gear_label: string; user_rpm: number }
  | { kind: 'detecting'; vehicle_id: UUID; gear_label: string; user_rpm: number }
  | {
      kind: 'reviewing';
      vehicle_id: UUID; gear_label: string; user_rpm: number;
      candidates: CalibrationCandidate[];
    }
  | {
      kind: 'saving';
      vehicle_id: UUID; gear_label: string; user_rpm: number;
      candidates: CalibrationCandidate[];
    }
  | { kind: 'saved'; vehicle_id: UUID; calibration_id: UUID };

/** Hands-free sessions self-terminate after this long as a runaway guard. */
export const MAX_SESSION_DURATION_MS = 30 * 60_000;
