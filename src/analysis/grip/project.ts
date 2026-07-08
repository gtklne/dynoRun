/**
 * Equirectangular projection of GPS fixes to metres around the session
 * centroid. Good to well under a metre across a race track; samples with a
 * missing fix (lat 0) are excluded from the centroid.
 */
export function projectTrack(lat: number[], lon: number[]): { px: Float32Array; py: Float32Array } {
  const N = lat.length;
  let lat0 = 0;
  let lon0 = 0;
  let c = 0;
  for (let i = 0; i < N; i++) {
    if (lat[i]) { lat0 += lat[i]; lon0 += lon[i]; c++; }
  }
  if (c > 0) { lat0 /= c; lon0 /= c; }
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const ky = 110540;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = (lon[i] - lon0) * kx;
    py[i] = (lat[i] - lat0) * ky;
  }
  return { px, py };
}
