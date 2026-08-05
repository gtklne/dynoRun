export interface TrackTransform {
  /** metres → canvas x */
  X: (mx: number) => number;
  /** metres → canvas y (screen y grows downward, so north is up) */
  Y: (my: number) => number;
  /** centre of the fitted extent, in canvas coordinates */
  cx: number;
  cy: number;
  /** canvas pixels per metre */
  scale: number;
}

/**
 * Fit a stretch of projected track coordinates into a canvas, preserving
 * aspect ratio. Shared by the session track map and the compare delta map so
 * the two draw the same shape at the same scale.
 */
export function fitTrackTransform(
  px: ArrayLike<number>,
  py: ArrayLike<number>,
  from: number,
  to: number,
  w: number,
  h: number,
  pad: number,
): TrackTransform {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = from; i <= to; i++) {
    if (px[i] < minX) minX = px[i];
    if (px[i] > maxX) maxX = px[i];
    if (py[i] < minY) minY = py[i];
    if (py[i] > maxY) maxY = py[i];
  }
  // a single fix, or none, would otherwise divide by zero
  if (!Number.isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const ox = (w - spanX * scale) / 2 - minX * scale;
  const oy = (h - spanY * scale) / 2 - minY * scale;
  return {
    X: (mx: number) => mx * scale + ox,
    Y: (my: number) => h - (my * scale + oy),
    cx: ((minX + maxX) / 2) * scale + ox,
    cy: h - (((minY + maxY) / 2) * scale + oy),
    scale,
  };
}
