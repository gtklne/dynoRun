// Every estimate the grip analysis relies on, with its UI metadata. The schema
// is the single source of truth: defaults, clamping bounds, and what a change
// costs ('recompute' re-derives channels/envelope/corners, 'combined' re-mixes
// the Dynamic-load metric, 'render' just redraws).

export interface GripSettings {
  /** weight-transfer factor: CoG height ÷ wheelbase */
  K: number;
  /** transient weighting for Dynamic load, seconds */
  tau: number;
  /** g — tyre-class grip level that anchors the colour ramp (red = anchor) */
  anchorG: number;
  /** km/h — samples slower than this are excluded from the envelope fit */
  envMinSpeed: number;
  /** deg — minimum apex lean for a corner */
  cornerLean: number;
  /** km/h — minimum speed drop into an apex */
  cornerDrop: number;
  /** s — speed minima closer than this merge into one corner */
  mergeGap: number;
  /** points — corners this far below your session best get the "spare" flag */
  spareScore: number;
  /** g/s — load-transfer rate that reads as full-scale */
  rateFS: number;
  /** samples — smoothing window for GPS speed (25 samples = 1 s) */
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
      help: 'Centre-of-gravity height ÷ wheelbase. Sets how much load shifts front↔rear per g of braking or drive (front ≈ 50% − K·a_long). Higher = a taller or shorter bike that dives and squats more. Affects the weight-distribution readout.' },
    { key: 'tau', label: 'Transient weighting τ', def: 0.30, min: 0.05, max: 0.60, step: 0.01, unit: 's', dp: 2, apply: 'combined',
      help: 'How strongly load-transfer rate counts toward Dynamic load, expressed as a suspension/tyre settling time in seconds. 0 = ignore transients (pure grip); higher = snappy throttle/brake/steer inputs read hotter.' },
  ] },
  { group: 'Scores & colours', items: [
    { key: 'anchorG', label: 'Colour anchor (tyre class)', def: 1.10, min: 0.70, max: 1.50, step: 0.05, unit: 'g', dp: 2, apply: 'render',
      help: 'The g demand that reads as full red — set it to what your tyres can roughly deliver: rain ≈ 0.80, sport road ≈ 1.00, race road ≈ 1.10, slicks ≈ 1.30. Scores themselves never change with this; only the colours do.' },
    { key: 'spareScore', label: '“Spare” flag threshold', def: 10, min: 3, max: 30, step: 1, unit: 'pts', dp: 0, apply: 'render',
      help: 'A corner scoring at least this many points below your best at the same corner (other laps) gets the green “spare” flag — you have proven you can go harder there.' },
  ] },
  { group: 'Traction envelope', items: [
    { key: 'envMinSpeed', label: 'Min speed for envelope', def: 18, min: 5, max: 60, step: 1, unit: 'km/h', dp: 0, apply: 'recompute',
      help: 'Samples slower than this are excluded from the envelope fit, so pit-lane and crawling don’t pollute it. Raise it if a slow section drags the boundary down.' },
  ] },
  { group: 'Corner detection', items: [
    { key: 'cornerLean', label: 'Min lean for a corner', def: 8, min: 4, max: 25, step: 1, unit: '°', dp: 0, apply: 'recompute',
      help: 'A corner’s apex must reach at least this lean angle. Raise to ignore gentle kinks; lower to catch fast, shallow corners that barely lean.' },
    { key: 'cornerDrop', label: 'Min speed drop (apex)', def: 7, min: 3, max: 20, step: 1, unit: 'km/h', dp: 0, apply: 'recompute',
      help: 'How much speed must dip into a corner for its slowest point to count as a distinct apex. Higher merges a complex into one corner; lower splits it into several.' },
    { key: 'mergeGap', label: 'Merge nearby apexes', def: 1.2, min: 0.4, max: 2.5, step: 0.1, unit: 's', dp: 1, apply: 'recompute',
      help: 'Two speed minima closer together in time than this are treated as one corner. Prevents a bumpy apex from registering as two turns.' },
  ] },
  { group: 'Display & thresholds', items: [
    { key: 'rateFS', label: 'Transient full-scale', def: 3.0, min: 1.0, max: 3.5, step: 0.1, unit: 'g/s', dp: 1, apply: 'render',
      help: 'The load-transfer rate that reads as full brightness on the comet trail and full-scale on the timeline and corner badges. Hard racing flicks and brake hits top out near 3 g/s; lower it to make moderate transitions pop more.' },
    { key: 'speedSmooth', label: 'Speed smoothing', def: 9, min: 3, max: 19, step: 2, unit: 'samples', dp: 0, apply: 'recompute',
      help: 'Window used to smooth GPS speed before differentiating it into g-force and jerk. Wider = cleaner traces but slightly laggy; narrower = twitchier. 25 samples = 1 second.' },
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
      out[d.key] = Math.min(d.max, Math.max(d.min, v));
    }
  }
  return out;
}

/** The settings keys whose change requires a full re-analysis. */
export const RECOMPUTE_KEYS = ALL_DEFS.filter((d) => d.apply === 'recompute').map((d) => d.key);
