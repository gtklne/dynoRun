import { describe, it, expect } from 'vitest';
import { shapesForKind, shapePreset, isBodyShapeForKind } from '@/shared/body-shapes';

describe('body-shapes', () => {
  it('lists car shapes for cars and motorcycle shapes for bikes', () => {
    const carValues = shapesForKind('car').map((s) => s.value);
    const motoValues = shapesForKind('motorcycle').map((s) => s.value);
    expect(carValues).toContain('sedan');
    expect(carValues).toContain('van');
    expect(carValues).not.toContain('cruiser');
    expect(motoValues).toContain('cruiser');
    expect(motoValues).not.toContain('sedan');
  });

  it('returns the Cd + frontal area preset for a valid shape', () => {
    const sedan = shapePreset('car', 'sedan');
    expect(sedan?.cd).toBeCloseTo(0.30, 6);
    expect(sedan?.frontal_area_m2).toBeCloseTo(2.2, 6);
  });

  it('returns null for a shape that does not belong to the kind', () => {
    expect(shapePreset('car', 'cruiser')).toBeNull();
    expect(shapePreset('motorcycle', 'sedan')).toBeNull();
    expect(shapePreset('car', null)).toBeNull();
  });

  it('validates shape membership per kind', () => {
    expect(isBodyShapeForKind('car', 'suv')).toBe(true);
    expect(isBodyShapeForKind('car', 'sport')).toBe(false);
    expect(isBodyShapeForKind('motorcycle', 'touring')).toBe(true);
    expect(isBodyShapeForKind('car', 'nonsense')).toBe(false);
  });
});
