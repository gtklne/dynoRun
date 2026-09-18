// Every estimate the grip analysis relies on, with its UI metadata. The schema
// is the single source of truth: defaults, clamping bounds, and what a change
// costs ('recompute' re-derives channels/envelope/corners, 'combined' re-mixes
// the activity index, 'render' just redraws).

export interface GripSettings {
  /** weight-transfer factor: CoG height ÷ wheelbase */
  K: number;
  /** rate weighting for the activity index, seconds */
  tau: number;
  /** g: display-only colour ramp anchor */
  anchorG: number;
  /** km/h: samples slower than this are excluded from the envelope fit */
  envMinSpeed: number;
  /** deg: minimum apex lean for a corner */
  cornerLean: number;
  /** km/h: minimum speed drop into an apex */
  cornerDrop: number;
  /** s: speed minima closer than this merge into one corner */
  mergeGap: number;
  /** points: observed difference threshold, persisted under its legacy key */
  spareScore: number;
  /** g/s: minimum full scale for demand-rate charts */
  rateFS: number;
  /** legacy window units: full time width is (value - 1) / 25 seconds */
  speedSmooth: number;
}

export type GripSettingKey = keyof GripSettings;
export type GripSettingApply = 'recompute' | 'combined' | 'render';

export interface GripSettingDef {
  key: GripSettingKey;
  label: string;
  def: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  dp: number;
  apply: GripSettingApply;
  help: string;
}

export interface GripSettingGroup {
  group: string;
  items: GripSettingDef[];
}

export const GRIP_SETTINGS_SCHEMA: GripSettingGroup[] = [
  { group: 'Bike & physics', items: [
    { key: 'K', label: 'Weight-transfer factor', def: 0.45, min: 0.30, max: 0.60, step: 0.01, unit: '', dp: 2, apply: 'render',
      help: 'Approximate centre-of-mass height / wheelbase. Assumes 50/50 static axle load and omits aero moments. Display estimate only.' },
    { key: 'tau', label: 'Transient weighting τ', def: 0.30, min: 0, max: 0.60, step: 0.01, unit: 's', dp: 2, apply: 'combined',
      help: 'Seconds weighting the demand-rate term in the activity index. This is not a measured settling time. Zero gives pure demand.' },
  ] },
  { group: 'Scores & colours', items: [
    { key: 'anchorG', label: 'Colour display scale', def: 1.10, min: 0.70, max: 1.50, step: 0.05, unit: 'g', dp: 2, apply: 'render',
      help: 'Demand at the red end of the colour scale. This changes colours only; it is not an estimate of tyre capacity.' },
    { key: 'spareScore', label: 'Demand difference flag', def: 10, min: 3, max: 30, step: 1, unit: 'pts', dp: 0, apply: 'render',
      help: 'Highlight an observed demand difference from the maximum on other laps. It does not establish available grip or safe extra speed.' },
  ] },
  { group: 'Traction envelope', items: [
    { key: 'envMinSpeed', label: 'Min speed for envelope', def: 18, min: 5, max: 60, step: 1, unit: 'km/h', dp: 0, apply: 'recompute',
      help: 'Exclude slower samples from the observed envelope. A tunable selection rule, not a validated physical threshold.' },
  ] },
  { group: 'Corner detection', items: [
    { key: 'cornerLean', label: 'Min lean for a corner', def: 8, min: 4, max: 25, step: 1, unit: '°', dp: 0, apply: 'recompute',
      help: 'Inclusive lean threshold for speed minima and sustained-lean bends. Detection heuristic, not a track survey.' },
    { key: 'cornerDrop', label: 'Min speed drop (apex)', def: 7, min: 3, max: 20, step: 1, unit: 'km/h', dp: 0, apply: 'recompute',
      help: 'Inclusive speed prominence within three seconds of a minimum. Constant-speed bends can also qualify through sustained lean.' },
    { key: 'mergeGap', label: 'Merge nearby apexes', def: 1.2, min: 0.4, max: 2.5, step: 0.1, unit: 's', dp: 1, apply: 'recompute',
      help: 'Nearby same-direction speed minima are merged within this time. A detection heuristic.' },
  ] },
  { group: 'Display & thresholds', items: [
    { key: 'rateFS', label: 'Transient full-scale', def: 3.0, min: 1.0, max: 3.5, step: 0.1, unit: 'g/s', dp: 1, apply: 'render',
      help: 'Minimum visual scale for demand rate in g/s. Charts expand to show higher readings. Not a physical limit.' },
    { key: 'speedSmooth', label: 'Speed smoothing', def: 9, min: 3, max: 19, step: 2, unit: 'samples', dp: 0, apply: 'recompute',
      help: 'Speed filter width: (value - 1) / 25 seconds. Historical 25 Hz sample-count setting, applied in elapsed time at every recording rate. Symmetric offline filtering attenuates transients without a causal delay.' },
  ] },
];

const ALL_DEFS: GripSettingDef[] = GRIP_SETTINGS_SCHEMA.flatMap((g) => g.items);

export const DEFAULT_GRIP_SETTINGS: GripSettings = Object.fromEntries(
  ALL_DEFS.map((d) => [d.key, d.def]),
) as unknown as GripSettings;

/**
 * Coerce arbitrary stored JSON into valid settings: unknown keys dropped,
 * missing/invalid values fall back to defaults, numbers clamped to bounds.
 */
export function sanitizeGripSettings(input: unknown): GripSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_GRIP_SETTINGS };
  for (const d of ALL_DEFS) {
    const v = src[d.key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const clamped = Math.min(d.max, Math.max(d.min, v));
      out[d.key] = d.key === 'speedSmooth' ? 2 * Math.round((clamped - 1) / 2) + 1 : clamped;
    }
  }
  return out;
}

/** The settings keys whose change requires a full re-analysis. */
export const RECOMPUTE_KEYS = ALL_DEFS.filter((d) => d.apply === 'recompute').map((d) => d.key);
