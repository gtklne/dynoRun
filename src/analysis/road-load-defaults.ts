import type { VehicleKind } from '@/shared/types';

// Physical constants. Air density is fixed at the ISA sea-level value because
// every published drag coefficient is referenced to it; the 1.20-vs-1.225
// distinction is ~2%, far below the uncertainty in CdA, and a per-run density
// correction would only matter across very different days/altitudes (which
// cancels for same-vehicle comparisons and confounds with the engine's own
// air-charge response, which we deliberately do NOT model — we measure the
// power actually delivered on the day).
export const AIR_DENSITY_KG_M3 = 1.225;
export const GRAVITY_M_S2 = 9.81;

// Defaults used when a vehicle hasn't specified its own aero numbers. These are
// drag-area (CdA, m²) and rolling-resistance (Crr) figures from the road-load
// literature (SAE J1263/J2263 coastdown work, TRB SR-286, Cossalter). They make
// the curve shape honest (aero restores the high-RPM end, rolling tilts it);
// since they're constant per vehicle kind they cancel for same-vehicle
// comparisons and only ever nudge the absolute level.
interface RoadLoadDefaults {
  cd_a_m2: number;
  crr: number;
}

const DEFAULTS_BY_KIND: Record<VehicleKind, RoadLoadDefaults> = {
  // CdA 0.70 ≈ Cd 0.31 × A 2.26 (typical sedan); Crr midpoint of H/V-rated OEM tyres.
  car: { cd_a_m2: 0.70, crr: 0.011 },
  // CdA 0.55 = generic naked/standard + upright rider; Crr between sport-touring
  // (0.0137 measured) and Cossalter's ~0.020 typical.
  motorcycle: { cd_a_m2: 0.55, crr: 0.016 },
};

export interface ResolvedRoadLoad {
  cd_a_m2: number;
  crr: number;
  air_density_kg_m3: number;
}

// Resolve the aero drag-area and rolling-resistance coefficient for a vehicle,
// preferring its own drag_coefficient × frontal_area_m2 when both are present
// and falling back to kind defaults otherwise.
export function resolveRoadLoad(
  kind: VehicleKind,
  drag_coefficient: number | null | undefined,
  frontal_area_m2: number | null | undefined,
): ResolvedRoadLoad {
  const defaults = DEFAULTS_BY_KIND[kind] ?? DEFAULTS_BY_KIND.car;
  const cd_a_m2 =
    drag_coefficient != null && frontal_area_m2 != null
      ? drag_coefficient * frontal_area_m2
      : defaults.cd_a_m2;
  return { cd_a_m2, crr: defaults.crr, air_density_kg_m3: AIR_DENSITY_KG_M3 };
}
