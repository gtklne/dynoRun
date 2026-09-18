// Grip Utilization: types for the track-session analysis pipeline.
// Base channels are plain number[] so a session round-trips through jsonb
// storage unchanged; derived channels are Float32Array for compactness.

/** Bump when the stored data envelope shape changes (see storage.ts). */
export const GRIP_DATA_VERSION = 2;
/** Analysis revision; derived results are always recalculated from raw data. */
export const GRIP_ANALYSIS_VERSION = 2;

/** Columnar per-sample channels parsed from a RaceBox CSV export, with recorded timestamps. */
export interface GripChannels {
  /** seconds since session start */
  t: number[];
  lat: number[];
  lon: number[];
  /** m/s */
  spd: number[];
  /** degrees, signed: left negative, right positive */
  lean: number[];
  /** lap number per sample; 0 = out/in/pit */
  lap: number[];
  /** heading, degrees */
  head: number[];
  /** False for held/backfilled fixes. Absent in legacy v1 recordings. */
  positionValid?: boolean[];
}

export interface GripLapMeta {
  name: string;
  time: number;
}

export interface GripSessionMeta {
  track: string;
  config: string;
  date: string;
  best: number | null;
  laps: GripLapMeta[];
}

export interface ParsedGripSession {
  meta: GripSessionMeta;
  n: number;
  ch: GripChannels;
  /** rows whose GPS fix was missing, so the previous position was held */
  noFix?: number;
  /** rows skipped as truncated, unparseable, or out of chronological order */
  dropped?: number;
}

export interface GripDerivedChannels {
  /** smoothed speed, m/s */
  spdS: Float32Array;
  /** smoothed lean, deg */
  leanS: Float32Array;
  /** longitudinal tire-demand g: dv/dt + aero drag + rolling resistance */
  along: Float32Array;
  /** kinematic longitudinal g (dv/dt only): weight transfer is driven by
   *  total deceleration, drag included, so it uses this, not `along` */
  alongRaw: Float32Array;
  /** lateral g (tan of lean), signed */
  alat: Float32Array;
  /** combined |g| */
  comb: Float32Array;
  /** direction of the g vector, atan2(along, alat) */
  theta: Float32Array;
}

export interface GripEnvelope {
  /** observed directional p95 radius per angular bin, g (ENVELOPE_BINS entries) */
  env: Float32Array;
  /** peak envelope radius across all bins, g: hardest sustained direction */
  gref: number;
  /** session score: 100 × RMS envelope radius (100 ≈ a full 1 g circle) */
  sessionScore: number;
  /** samples the fit used: 0 means there is no envelope, not a 0 g one */
  fitSamples: number;
  /** Unsupported angular bins; these stay NaN instead of being invented. */
  emptyBins: number;
}

export interface GripLoadChannels {
  /** longitudinal demand-component rate, g/s */
  jLong: Float32Array;
  /** lateral demand-component rate, g/s */
  jLat: Float32Array;
  /** |dG/dt|: rate of the vehicle-aligned demand vector, g/s */
  loadRate: Float32Array;
}

export interface GripCorner {
  /** per-lap detection index, 1-based, NOT a track turn id. Use `turn` */
  n: number;
  /**
   * Track turn id, stable across every lap of the session (see turns.ts).
   * 0 when this detection could not be matched to a turn the session's other
   * laps agree on: a one-off minimum, not a bend.
   */
  turn: number;
  /** global sample indices: window start / apex / end */
  l: number;
  ap: number;
  r: number;
  dir: 'L' | 'R';
  /** m/s */
  minSpeed: number;
  /** deg */
  maxLean: number;
  /** grip-only demand stats in g (live metric stats come from cornerStats) */
  apexG: number;
  peakG: number;
  /** peak demand-component rate through the corner, g/s */
  peakLoad: number;
  tStart: number;
  tApex: number;
  tEnd: number;
}

/** A timed lap: a contiguous global sample range [start, end]. */
export interface GripLap {
  num: number;
  start: number;
  end: number;
  /** seconds */
  time: number;
  /** True when timing comes from sample boundaries rather than metadata. */
  estimatedTime?: boolean;
  corners: GripCorner[];
}

/** Everything derived from a parsed session under a given settings snapshot. */
export interface GripAnalysis extends GripDerivedChannels, GripEnvelope, GripLoadChannels {
  meta: GripSessionMeta;
  n: number;
  ch: GripChannels;
  /** projected track coordinates, metres around the session centroid */
  px: Float32Array;
  py: Float32Array;
  laps: GripLap[];
  /** distinct track turns the session's laps agree on (see turns.ts) */
  turnCount: number;
}
