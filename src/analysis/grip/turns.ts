import { frameForLap, lapPath, projectOntoReference, referenceAxis } from './align';
import { clusterByAxisDistance, median, minTurnSupport } from './turn-cluster';
import type { GripChannels, GripLap } from './types';

/**
 * Stable track turn numbers for one session.
 *
 * `GripCorner.n` is the order a corner was detected *within its own lap*, and
 * detection is unstable: on ten laps of the same circuit it finds 6 to 9
 * corners, so lap 3's "corner 5" and lap 1's "corner 5" are different bends.
 * Anything that pairs corners across laps ("your best at this corner", the
 * badge on the track map, the card heading) has to key on the track instead.
 *
 * The session's fastest lap becomes the spatial axis (the same construction
 * compare.ts uses across sessions), every lap's apexes are projected onto it,
 * and apexes landing at the same distance are one turn. Turns are then numbered
 * in track order from the start line, which is also the numbering the compare
 * screen shows: the two screens must not disagree about what T4 is.
 *
 * A detection that no cluster with enough support claims keeps `turn = 0`: a
 * one-off minimum that is not a bend. Numbering never shifts because of it.
 */
export function assignTrackTurns(ch: GripChannels, laps: GripLap[]): number {
  for (const lap of laps) for (const c of lap.corners) c.turn = 0;
  if (laps.length === 0) return 0;

  const ref = laps.reduce((a, b) => (b.time > 0 && b.time < a.time ? b : a), laps[0]);
  const frame = frameForLap(ch, ref);
  const refPath = lapPath(ch, ref, frame);
  const axis = referenceAxis(refPath);
  if (!(axis.length > 0)) return 0;

  interface Hit { s: number; lapNum: number; corner: GripLap['corners'][number] }
  const hits: Hit[] = [];
  for (const lap of laps) {
    if (lap.corners.length === 0) continue;
    const path = lap === ref ? refPath : lapPath(ch, lap, frame);
    // same session, same GPS datum by construction, no offset fit
    const u = lap === ref ? axis.u : projectOntoReference(path, refPath, axis).u;
    for (const c of lap.corners) {
      const k = Math.max(0, Math.min(u.length - 1, c.ap - path.i0));
      const s = u[k];
      // a "corner" projecting outside the lap's own axis is not on this layout
      if (!(s >= -axis.tol) || !(s <= axis.length + axis.tol)) continue;
      hits.push({ s, lapNum: lap.num, corner: c });
    }
  }
  if (hits.length === 0) return 0;

  const minSupport = minTurnSupport(laps.length);
  const clusters = clusterByAxisDistance(hits)
    .map((cl) => ({
      cl,
      s: median(cl.map((h) => h.s)),
      // one lap can detect two minima in a single bend (a bumpy or double
      // apex); it must still count as one lap's worth of support
      support: new Set(cl.map((h) => h.lapNum)).size,
    }))
    .filter((c) => c.support >= minSupport)
    .sort((a, b) => a.s - b.s);

  clusters.forEach((c, i) => {
    for (const h of c.cl) h.corner.turn = i + 1;
  });
  return clusters.length;
}

/**
 * Best apex demand per *track turn* across every lap: the "you have already
 * proven you can" reference. Keyed on `turn`, never on `n`; corners with
 * turn = 0 are excluded because there is nothing on other laps to compare them
 * against.
 */
export function bestApexPerTurn(
  laps: GripLap[],
  apexOf: (corner: GripLap['corners'][number]) => number,
): Map<number, number> {
  const best = new Map<number, number>();
  for (const lap of laps) {
    for (const c of lap.corners) {
      if (c.turn === 0) continue;
      const v = apexOf(c);
      if (v > (best.get(c.turn) ?? 0)) best.set(c.turn, v);
    }
  }
  return best;
}
