// Synthetic RaceBox session for grip-analysis tests: 25 Hz, a 4 s out-lap
// (lap 0) then two 40 s laps, each with a left corner and a right corner.
// Speed dips and lean rise as gaussians around each apex, so corner detection
// has clean, known ground truth.

export const HZ = 25;
export const LAP_S = 40;
export const OUT_S = 4;
export const BASE_SPEED = 30; // m/s
export const CORNER_DIP = 15; // m/s subtracted at the apex
export const PEAK_LEAN = 40; // deg
/** apex offsets within each lap, seconds → direction */
export const APEXES: { at: number; dir: 'L' | 'R' }[] = [
  { at: 12, dir: 'L' },
  { at: 28, dir: 'R' },
];

const gauss = (x: number, sigma: number) => Math.exp(-(x * x) / (2 * sigma * sigma));

export interface SyntheticRow {
  t: number;
  lat: number;
  lon: number;
  spd: number;
  lean: number;
  lap: number;
  head: number;
}

export function syntheticRows(): SyntheticRow[] {
  const rows: SyntheticRow[] = [];
  const total = OUT_S + 2 * LAP_S;
  let x = 0;
  let y = 0;
  let head = 0;
  const lat0 = 47.0;
  const lon0 = 8.0;
  for (let i = 0; i < total * HZ; i++) {
    const t = i / HZ;
    const lap = t < OUT_S ? 0 : 1 + Math.floor((t - OUT_S) / LAP_S);
    const tl = lap === 0 ? t : (t - OUT_S) % LAP_S;
    let spd = lap === 0 ? 15 : BASE_SPEED;
    let lean = 0;
    if (lap > 0) {
      for (const apex of APEXES) {
        const d = tl - apex.at;
        spd -= CORNER_DIP * gauss(d, 2);
        lean += (apex.dir === 'L' ? -1 : 1) * PEAK_LEAN * gauss(d, 1.5);
      }
      for (const apex of APEXES) {
        // heading sweeps ~120° through each corner
        head += ((apex.dir === 'L' ? -1 : 1) * 120 * gauss(tl - apex.at, 1.5)) / HZ / 1.5;
      }
    }
    x += (spd * Math.sin((head * Math.PI) / 180)) / HZ;
    y += (spd * Math.cos((head * Math.PI) / 180)) / HZ;
    rows.push({
      t,
      lat: lat0 + y / 110540,
      lon: lon0 + x / (111320 * Math.cos((lat0 * Math.PI) / 180)),
      spd,
      lean,
      lap,
      head: ((head % 360) + 360) % 360,
    });
  }
  return rows;
}

export function syntheticCsv(): string {
  const rows = syntheticRows();
  const lines = [
    'Track,Testring',
    'Configuration,GP',
    'Date,2026-07-08',
    `Best Lap Time,${(LAP_S - 0.5).toFixed(2)}`,
    `Lap 1,${(LAP_S - 0.5).toFixed(2)}`,
    `Lap 2,${LAP_S.toFixed(2)}`,
    'Record,Time,Latitude,Longitude,Speed (m/s),Lap,Heading,LeanAngle (deg)',
  ];
  const t0 = Date.parse('2026-07-08T10:00:00.000Z');
  rows.forEach((r, i) => {
    const ts = new Date(t0 + r.t * 1000).toISOString();
    lines.push(
      `${i + 1},${ts},${r.lat.toFixed(7)},${r.lon.toFixed(7)},${r.spd.toFixed(3)},${r.lap},${r.head.toFixed(1)},${r.lean.toFixed(2)}`,
    );
  });
  return lines.join('\n') + '\n';
}
