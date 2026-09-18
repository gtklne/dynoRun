/** Sampling diagnostics are engineering guards, not physical limits. */
export function nominalInterval(t: ArrayLike<number>): number {
  const dt: number[] = [];
  for (let i = 1; i < t.length; i++) if (t[i] > t[i - 1]) dt.push(t[i] - t[i - 1]);
  dt.sort((a, b) => a - b);
  return dt.length ? dt[dt.length >> 1] : 0.04;
}

/** More than 1.5 nominal periods means at least one expected sample is missing. */
export function gapLimit(t: ArrayLike<number>): number { return nominalInterval(t) * 1.5; }

export function nearestTime(t: ArrayLike<number>, value: number, a = 0, b = t.length - 1): number {
  let lo = a, hi = b;
  while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < value) lo = m + 1; else hi = m; }
  return lo > a && value - t[lo - 1] < t[lo] - value ? lo - 1 : lo;
}

/** Apply only within contiguous, finite runs. No interpolation across holes. */
function runs(t: ArrayLike<number>, a: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = [];
  const gap = gapLimit(t);
  let start = -1;
  for (let i = 0; i <= t.length; i++) {
    if (start >= 0 && (i === t.length || !Number.isFinite(a[i]) || t[i] - t[i - 1] > gap)) {
      out.push([start, i - 1]); start = -1;
    }
    if (i < t.length && start < 0 && Number.isFinite(a[i])) start = i;
  }
  return out;
}

/** Integral of the linearly interpolated signal, with a symmetric time window.
 * Shrinking symmetrically at edges preserves constants and ramps at their own
 * timestamps. The offline filter has no causal delay; it attenuates transients.
 */
export function timeAverage(t: ArrayLike<number>, a: ArrayLike<number>, halfSeconds: number): Float32Array {
  const out = new Float32Array(t.length).fill(NaN);
  for (const [start, end] of runs(t, a)) {
    const integral = new Float64Array(end - start + 1);
    for (let i = start + 1; i <= end; i++) integral[i - start] = integral[i - start - 1] + (a[i] + a[i - 1]) * 0.5 * (t[i] - t[i - 1]);
    const area = (at: number) => {
      let lo = start, hi = end;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t[m] <= at) lo = m; else hi = m - 1; }
      if (lo === end) return integral[end - start];
      const dt = at - t[lo];
      return integral[lo - start] + a[lo] * dt + 0.5 * (a[lo + 1] - a[lo]) / (t[lo + 1] - t[lo]) * dt * dt;
    };
    for (let i = start; i <= end; i++) {
      const h = Math.min(halfSeconds, t[i] - t[start], t[end] - t[i]);
      out[i] = h > 1e-8 ? (area(t[i] + h) - area(t[i] - h)) / (2 * h) : a[i];
    }
  }
  return out;
}

export function timeDerivative(t: ArrayLike<number>, a: ArrayLike<number>, halfSeconds = 0.12): Float32Array {
  const out = new Float32Array(t.length).fill(NaN);
  for (const [start, end] of runs(t, a)) {
    if (start === end) continue;
    for (let i = start; i <= end; i++) {
      const lo = Math.min(i, nearestTime(t, t[i] - halfSeconds, start, end));
      const hi = Math.max(i, nearestTime(t, t[i] + halfSeconds, start, end));
      // Low-rate logs still need two actual samples, never a zero derivative.
      const l = lo === hi ? Math.max(start, i - 1) : lo;
      const r = lo === hi ? Math.min(end, i + 1) : hi;
      out[i] = (a[r] - a[l]) / (t[r] - t[l]);
    }
  }
  return out;
}
