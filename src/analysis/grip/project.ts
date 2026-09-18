import { geoFrame } from './align';

/** Shared WGS84 local projection. Missing fixes do not influence the origin. */
export function projectTrack(lat: number[], lon: number[], valid?: boolean[]): { px: Float32Array; py: Float32Array } {
  let lat0 = 0, lon0 = 0, n = 0;
  for (let i = 0; i < lat.length; i++) {
    if (valid?.[i] !== false) { lat0 += lat[i]; lon0 += lon[i]; n++; }
  }
  const f = geoFrame(n ? lat0 / n : 0, n ? lon0 / n : 0);
  return {
    px: Float32Array.from(lon, (v) => (v - f.lon0) * f.kx),
    py: Float32Array.from(lat, (v) => (v - f.lat0) * f.ky),
  };
}
