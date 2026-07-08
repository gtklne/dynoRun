// Grip Utilization — types for the track-session analysis pipeline.
// Base channels are plain number[] so a session round-trips through jsonb
// storage unchanged; derived channels are Float32Array for compactness.

/** Bump when the stored data envelope shape changes (see storage.ts). */
export const GRIP_DATA_VERSION = 1;

/** Columnar per-sample channels parsed from a RaceBox CSV export (25 Hz). */
export interface GripChannels {
  /** seconds since session start */
  t: number[];
  lat: number[];
  lon: number[];
  /** m/s */
  spd: number[];
  /** degrees, signed — left negative, right positive */
  lean: number[];
  /** lap number per sample; 0 = out/in/pit */
  lap: number[];
  /** heading, degrees */
  head: number[];
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
}

export interface GripDerivedChannels {
  /** smoothed speed, m/s */
  spdS: Float32Array;
  /** smoothed lean, deg */
  leanS: Float32Array;
  /** longitudinal tire-demand g: dv/dt + aero drag + rolling resistance */
  along: Float32Array;
  /** kinematic longitudinal g (dv/dt only) — weight transfer is driven by
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
  /** fitted personal envelope radius per angular bin, g (ENVELOPE_BINS entries) */
  env: Float32Array;
  /** peak envelope radius across all bins, g — hardest sustained direction */
  gref: number;
  /** session score: 100 × RMS envelope radius (100 ≈ a full 1 g circle) */
  sessionScore: number;
}

export interface GripLoadChannels {
  /** fore/aft load-transfer rate (dive/squat), g/s */
  jLong: Float32Array;
  /** side/side load-transfer rate (flick), g/s */
  jLat: Float32Array;
  /** |dG/dt| — how fast the whole load state is moving, g/s */
  loadRate: Float32Array;
}

export interface GripCorner {
  n: number;
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
  /** peak load-transfer rate through the corner, g/s */
  peakLoad: number;
  tStart: number;
  tApex: number;
  tEnd: number;
}

/** A timed lap — a contiguous global sample range [start, end]. */
export interface GripLap {
  num: number;
  start: number;
  end: number;
  /** seconds */
  time: number;
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
}
