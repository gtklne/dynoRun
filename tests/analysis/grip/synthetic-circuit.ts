// A closed synthetic circuit with a quasi-steady-state lap simulation, used as
// ground truth for lap comparison. The generator in synthetic.ts integrates
// heading forward, so each of its laps lands somewhere new in space, fine for
// corner detection, useless for spatial alignment. Here the centreline is a
// closed polar curve r(θ) = R0 + A1·cos(2θ) + A2·cos(3θ), so every lap
// retraces the exact same geometry and only the speed profile changes.

export const HZ = 25;
const GRAVITY = 9.80665;

const R0 = 250;
const A1 = 60;
const A2 = 40;

/** Centreline resolution before arc-length resampling. */
const THETA_STEPS = 20000;

export interface TrackPoint {
  x: number;
  y: number;
  /** cumulative arc length from θ=0, metres */
  s: number;
  /** signed curvature, 1/m (positive = left turn) */
  k: number;
  /** path tangent heading, degrees clockwise from +y (north) */
  head: number;
}

const rAt = (th: number) => R0 + A1 * Math.cos(2 * th) + A2 * Math.cos(3 * th);

/** Closed centreline resampled to a uniform arc-length step. */
export function buildTrack(stepM = 1): TrackPoint[] {
  const raw: { x: number; y: number; s: number; k: number }[] = [];
  let s = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= THETA_STEPS; i++) {
    const th = (i / THETA_STEPS) * 2 * Math.PI;
    const r = rAt(th);
    const x = r * Math.cos(th);
    const y = r * Math.sin(th);
    if (i > 0) s += Math.hypot(x - px, y - py);
    px = x;
    py = y;
    // κ for a polar curve: (r² + 2r'² − r·r'') / (r² + r'²)^{3/2}
    const d1 = -2 * A1 * Math.sin(2 * th) - 3 * A2 * Math.sin(3 * th);
    const d2 = -4 * A1 * Math.cos(2 * th) - 9 * A2 * Math.cos(3 * th);
    const k = (r * r + 2 * d1 * d1 - r * d2) / Math.pow(r * r + d1 * d1, 1.5);
    raw.push({ x, y, s, k });
  }

  const total = raw[raw.length - 1].s;
  const n = Math.round(total / stepM);
  const out: TrackPoint[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (i / n) * total;
    while (j < raw.length - 2 && raw[j + 1].s < target) j++;
    const seg = raw[j + 1].s - raw[j].s;
    const f = seg > 0 ? (target - raw[j].s) / seg : 0;
    out.push({
      x: raw[j].x + (raw[j + 1].x - raw[j].x) * f,
      y: raw[j].y + (raw[j + 1].y - raw[j].y) * f,
      s: target,
      k: raw[j].k + (raw[j + 1].k - raw[j].k) * f,
      head: 0,
    });
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const b = out[(i + 1) % out.length];
    a.head = ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
  }
  return out;
}

export interface LapPace {
  /** lateral grip limit, g */
  aLat: number;
  /** drive limit, g */
  aAcc: number;
  /** brake limit, g */
  aBrk: number;
  /** top speed, m/s */
  vMax: number;
  /** constant lateral offset from the centreline, metres (racing-line shift) */
  lineOffset?: number;
}

export const BASE_PACE: LapPace = { aLat: 1.05, aAcc: 0.55, aBrk: 0.95, vMax: 62 };

/**
 * Quasi-steady-state speed profile around the closed loop: corner-limited
 * speed, then alternating forward (drive-limited) and backward (brake-limited)
 * passes with wraparound until they stop changing anything.
 */
export function speedProfile(track: TrackPoint[], pace: LapPace): Float64Array {
  const n = track.length;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(track[i].k);
    v[i] = Math.min(pace.vMax, k > 1e-9 ? Math.sqrt((pace.aLat * GRAVITY) / k) : pace.vMax);
  }
  const ds = track[1].s - track[0].s;
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < n; i++) {
      const a = i;
      const b = (i + 1) % n;
      const cap = Math.sqrt(v[a] * v[a] + 2 * pace.aAcc * GRAVITY * ds);
      if (v[b] > cap) v[b] = cap;
    }
    for (let i = n - 1; i >= 0; i--) {
      const a = i;
      const b = (i + 1) % n;
      const cap = Math.sqrt(v[b] * v[b] + 2 * pace.aBrk * GRAVITY * ds);
      if (v[a] > cap) v[a] = cap;
    }
  }
  return v;
}

/** Exact lap time of a speed profile: ∮ ds/v. */
export function lapTimeOf(track: TrackPoint[], v: Float64Array): number {
  const ds = track[1].s - track[0].s;
  let t = 0;
  for (let i = 0; i < track.length; i++) t += ds / v[i];
  return t;
}

export function trackLength(track: TrackPoint[]): number {
  const ds = track[1].s - track[0].s;
  return track.length * ds;
}

export interface CircuitRow {
  t: number;
  lat: number;
  lon: number;
  spd: number;
  lean: number;
  lap: number;
  head: number;
}

export interface CircuitSession {
  rows: CircuitRow[];
  /** exact simulated lap time per lap, seconds */
  lapTimes: number[];
  trackLength: number;
  track: TrackPoint[];
}

const LAT0 = 47.5;
const LON0 = 7.5;
const KX = Math.cos((LAT0 * Math.PI) / 180) * 111320;
const KY = 110540;

/**
 * Sample a multi-lap session at 25 Hz. Each pace entry drives one timed lap;
 * lap 0 (a slow out-lap) is prepended so the fixture exercises the same
 * lap-0-is-not-timed handling as a real RaceBox export.
 */
export function simulateSession(paces: LapPace[], stepM = 1): CircuitSession {
  const track = buildTrack(stepM);
  const n = track.length;
  const ds = track[1].s - track[0].s;
  const total = n * ds;
  const rows: CircuitRow[] = [];
  const lapTimes: number[] = [];

  const outPace: LapPace = { aLat: 0.35, aAcc: 0.2, aBrk: 0.3, vMax: 22 };
  const all = [outPace, ...paces];

  let t = 0;
  all.forEach((pace, li) => {
    const v = speedProfile(track, pace);
    if (li > 0) lapTimes.push(lapTimeOf(track, v));
    let pos = 0;
    while (pos < total) {
      const idx = Math.min(n - 1, Math.floor(pos / ds));
      const nxt = (idx + 1) % n;
      const f = (pos - idx * ds) / ds;
      const p = track[idx];
      const q = track[nxt];
      const sp = v[idx] + (v[nxt] - v[idx]) * f;
      let x = p.x + (q.x - p.x) * f;
      let y = p.y + (q.y - p.y) * f;
      const kk = p.k + (q.k - p.k) * f;
      if (pace.lineOffset) {
        // shift perpendicular to the tangent: a different racing line on the
        // same track, which is what projection has to tolerate
        const hx = q.x - p.x;
        const hy = q.y - p.y;
        const L = Math.hypot(hx, hy) || 1;
        x += (-hy / L) * pace.lineOffset;
        y += (hx / L) * pace.lineOffset;
      }
      rows.push({
        t,
        lat: LAT0 + y / KY,
        lon: LON0 + x / KX,
        spd: sp,
        lean: (Math.atan((sp * sp * kk) / GRAVITY) * 180) / Math.PI,
        lap: li,
        head: p.head,
      });
      t += 1 / HZ;
      pos += sp / HZ;
    }
  });

  return { rows, lapTimes, trackLength: total, track };
}

/** Render a simulated session as a RaceBox-shaped CSV. */
export function circuitCsv(session: CircuitSession): string {
  const lines = [
    'Track,Synthetic Ring',
    'Configuration,Closed',
    'Date,2026-08-01',
    `Best Lap Time,${Math.min(...session.lapTimes).toFixed(3)}`,
    ...session.lapTimes.map((lt, i) => `Lap ${i + 1},${lt.toFixed(3)}`),
    'Record,Time,Latitude,Longitude,Speed (m/s),Lap,Heading,LeanAngle (deg)',
  ];
  const t0 = Date.parse('2026-08-01T12:00:00.000Z');
  session.rows.forEach((r, i) => {
    lines.push(
      `${i + 1},${new Date(t0 + r.t * 1000).toISOString()},${r.lat.toFixed(7)},${r.lon.toFixed(7)},` +
        `${r.spd.toFixed(3)},${r.lap},${r.head.toFixed(1)},${r.lean.toFixed(2)}`,
    );
  });
  return lines.join('\n') + '\n';
}
