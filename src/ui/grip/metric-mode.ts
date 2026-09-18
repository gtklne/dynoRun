// Demand is the default. Activity adds a tunable, nonphysical rate term.
export type GripMetricMode = 'grip' | 'load';

export function metricModeName(mode: GripMetricMode): string {
  return mode === 'load' ? 'Activity index' : 'Demand score';
}
