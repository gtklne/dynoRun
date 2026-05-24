export const kmhToMps = (kmh: number): number => kmh / 3.6;
export const mpsToKmh = (mps: number): number => mps * 3.6;
export const rpmToRadPerSec = (rpm: number): number => (rpm * 2 * Math.PI) / 60;
export const radPerSecToRpm = (w: number): number => (w * 60) / (2 * Math.PI);

/** metres of wheel travel per crankshaft revolution at the given calibration point */
export const computeRollout = (rpm: number, speedKmh: number): number =>
  kmhToMps(speedKmh) / (rpm / 60);
