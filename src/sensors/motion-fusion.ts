/**
 * Fuses 1 Hz GPS speed with high-frequency DeviceMotion to produce
 * a sub-second speed estimate for the live readout during calibration.
 *
 * Algorithm: integrate device acceleration between GPS fixes, project it
 * onto a learned "forward" axis (the cardinal axis whose integrated value
 * best matches the GPS-measured speed delta), and add that projection to
 * the last GPS speed. Clamped so a bad axis can't pin the readout to a
 * runaway value.
 */
export interface MotionFusionState {
  lastGpsSpeed_mps: number;
  intX: number;
  intY: number;
  intZ: number;
  lastMotionTime: number;
  forwardAxis: [number, number, number];
  hasGpsBaseline: boolean;
}

export function createMotionFusionState(): MotionFusionState {
  return {
    lastGpsSpeed_mps: 0,
    intX: 0,
    intY: 0,
    intZ: 0,
    lastMotionTime: 0,
    forwardAxis: [0, 1, 0],
    hasGpsBaseline: false,
  };
}

const AXIS_ADAPT_GAIN = 0.3;
const SIGNIFICANT_DELTA_MPS = 0.3;
const MAX_CORRECTION_MPS = 8;

function adaptAxis(state: MotionFusionState, delta_mps: number): void {
  const { intX, intY, intZ, forwardAxis: [ox, oy, oz] } = state;
  const candidates: Array<{ axis: [number, number, number]; err: number }> = [
    { axis: [1, 0, 0], err: Math.abs(intX - delta_mps) },
    { axis: [-1, 0, 0], err: Math.abs(-intX - delta_mps) },
    { axis: [0, 1, 0], err: Math.abs(intY - delta_mps) },
    { axis: [0, -1, 0], err: Math.abs(-intY - delta_mps) },
    { axis: [0, 0, 1], err: Math.abs(intZ - delta_mps) },
    { axis: [0, 0, -1], err: Math.abs(-intZ - delta_mps) },
  ];
  candidates.sort((a, b) => a.err - b.err);
  const [nx, ny, nz] = candidates[0].axis;
  const k = AXIS_ADAPT_GAIN;
  const bx = ox + (nx - ox) * k;
  const by = oy + (ny - oy) * k;
  const bz = oz + (nz - oz) * k;
  const len = Math.sqrt(bx * bx + by * by + bz * bz);
  if (len > 0.001) state.forwardAxis = [bx / len, by / len, bz / len];
}

/** Update fusion state with a new GPS fix. Returns the new baseline speed. */
export function onGpsFix(state: MotionFusionState, gpsSpeed_mps: number): void {
  const delta = gpsSpeed_mps - state.lastGpsSpeed_mps;
  if (state.hasGpsBaseline && Math.abs(delta) > SIGNIFICANT_DELTA_MPS) {
    adaptAxis(state, delta);
  }
  state.intX = 0;
  state.intY = 0;
  state.intZ = 0;
  state.lastGpsSpeed_mps = gpsSpeed_mps;
  state.hasGpsBaseline = true;
}

/**
 * Feed a motion sample. Returns the current fused speed in m/s, or null
 * if no GPS baseline has been seen yet.
 *
 * Ignores samples with dt outside (0, 0.5s] to reject stalls and time jumps.
 */
export function onMotionSample(
  state: MotionFusionState,
  ax: number,
  ay: number,
  az: number,
  tNow_ms: number,
): number | null {
  const dt = state.lastMotionTime > 0 ? (tNow_ms - state.lastMotionTime) / 1000 : 0;
  state.lastMotionTime = tNow_ms;
  if (dt <= 0 || dt > 0.5) return state.hasGpsBaseline ? state.lastGpsSpeed_mps : null;

  state.intX += ax * dt;
  state.intY += ay * dt;
  state.intZ += az * dt;

  if (!state.hasGpsBaseline) return null;

  const [fx, fy, fz] = state.forwardAxis;
  const correction = state.intX * fx + state.intY * fy + state.intZ * fz;
  const clamped = Math.max(-MAX_CORRECTION_MPS, Math.min(MAX_CORRECTION_MPS, correction));
  return Math.max(0, state.lastGpsSpeed_mps + clamped);
}
