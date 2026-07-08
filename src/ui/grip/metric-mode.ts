// The two ways to colour the session: pure steady-state grip demand, or with
// the load-transfer transient folded in ("Dynamic load", the default — a
// straight-line throttle↔brake swap reads hot even though net g is zero).

export type GripMetricMode = 'grip' | 'load';

export function metricModeName(mode: GripMetricMode): string {
  return mode === 'load' ? 'Dynamic load' : 'Grip utilization';
}
