/**
 * Grouping corner apexes that sit at the same place on a shared distance axis.
 *
 * Corner detection is genuinely unstable — ten laps of one circuit yield 6 to 9
 * corners — so a turn cannot be identified by its detection index. It is
 * identified by *where it is*, which means clustering apex distances along one
 * lap's racing line. Both the single-session turn numbering (turns.ts) and the
 * cross-session comparison (compare.ts) need exactly this, and they must agree,
 * so the linkage lives here once.
 */

/** Apexes closer than this along the axis belong to the same turn. */
export const CORNER_CLUSTER_M = 40;

// Single-linkage alone can chain: apexes 39 m apart in a long sequence would
// collapse into one enormous "turn". A cluster wider than this is split at its
// largest internal gap until every turn spans a plausible corner.
const MAX_CLUSTER_EXTENT_M = 2 * CORNER_CLUSTER_M;

export function splitWideCluster<T extends { s: number }>(cluster: T[]): T[][] {
  if (cluster.length < 2 || cluster[cluster.length - 1].s - cluster[0].s <= MAX_CLUSTER_EXTENT_M) {
    return [cluster];
  }
  let cut = 1;
  let widest = -1;
  for (let i = 1; i < cluster.length; i++) {
    const gap = cluster[i].s - cluster[i - 1].s;
    if (gap > widest) { widest = gap; cut = i; }
  }
  return [...splitWideCluster(cluster.slice(0, cut)), ...splitWideCluster(cluster.slice(cut))];
}

/**
 * Sort hits along the axis, link neighbours within CORNER_CLUSTER_M, then split
 * any cluster that chained too wide. `hits` is not mutated.
 */
export function clusterByAxisDistance<T extends { s: number }>(hits: readonly T[]): T[][] {
  const sorted = [...hits].sort((a, b) => a.s - b.s);
  const linked: T[][] = [];
  for (const h of sorted) {
    const last = linked[linked.length - 1];
    if (last && h.s - last[last.length - 1].s <= CORNER_CLUSTER_M) last.push(h);
    else linked.push([h]);
  }
  return linked.flatMap(splitWideCluster);
}

/**
 * A turn must be seen by a meaningful share of the laps, so one lap's spurious
 * speed minimum cannot invent a turn and shift every number after it. With two
 * laps that means either one, so a corner only one lap found still counts.
 */
export function minTurnSupport(lapCount: number): number {
  return Math.max(1, Math.ceil(0.4 * lapCount));
}

export const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
