import type { VehicleKind, BodyShape, CarShape, MotoShape } from './types';

export interface ShapePreset {
  label: string;
  cd: number;
  frontal_area_m2: number;
}

// Typical drag coefficient + frontal area by body shape, from the road-load
// literature (SAE coastdown studies, Hucho aerodynamics tables, Cossalter for
// motorcycles). These seed the vehicle's CdA; the frontal area stays editable so
// an unusual vehicle can be refined. Motorcycle values are machine + rider, with
// CdA roughly: sport ~0.32, naked ~0.55, cruiser/touring ~0.70.
export const CAR_SHAPES: Record<CarShape, ShapePreset> = {
  sedan: { label: 'Sedan', cd: 0.30, frontal_area_m2: 2.2 },
  hatchback: { label: 'Hatchback', cd: 0.32, frontal_area_m2: 2.1 },
  wagon: { label: 'Wagon / Estate', cd: 0.31, frontal_area_m2: 2.3 },
  coupe: { label: 'Coupe / Sports', cd: 0.31, frontal_area_m2: 2.0 },
  suv: { label: 'SUV / Crossover', cd: 0.35, frontal_area_m2: 2.6 },
  pickup: { label: 'Pickup', cd: 0.45, frontal_area_m2: 2.9 },
  van: { label: 'Van / Box', cd: 0.38, frontal_area_m2: 3.2 },
};

export const MOTO_SHAPES: Record<MotoShape, ShapePreset> = {
  sport: { label: 'Sport / faired', cd: 0.58, frontal_area_m2: 0.55 },
  naked: { label: 'Naked / standard', cd: 0.69, frontal_area_m2: 0.80 },
  cruiser: { label: 'Cruiser', cd: 0.78, frontal_area_m2: 0.90 },
  touring: { label: 'Touring', cd: 0.74, frontal_area_m2: 0.95 },
};

export interface ShapeOption extends ShapePreset {
  value: BodyShape;
}

// Selectable shapes for a vehicle kind, in display order.
export function shapesForKind(kind: VehicleKind): ShapeOption[] {
  const table = kind === 'motorcycle' ? MOTO_SHAPES : CAR_SHAPES;
  return (Object.keys(table) as BodyShape[]).map((value) => ({
    value,
    ...(table as Record<BodyShape, ShapePreset>)[value],
  }));
}

// The preset for a given shape, or null when the shape doesn't belong to the
// kind (e.g. a 'sport' bike shape after switching the vehicle to 'car').
export function shapePreset(kind: VehicleKind, shape: BodyShape | null | undefined): ShapePreset | null {
  if (!shape) return null;
  const table = kind === 'motorcycle' ? MOTO_SHAPES : CAR_SHAPES;
  return (table as Record<string, ShapePreset>)[shape] ?? null;
}

export function isBodyShapeForKind(kind: VehicleKind, value: string): value is BodyShape {
  return shapePreset(kind, value as BodyShape) != null;
}
