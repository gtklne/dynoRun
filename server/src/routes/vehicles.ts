import { Hono } from 'hono';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { vehicles, calibrations, runs, samples, derivedCurves, recordings } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

const ALLOWED_TRANSMISSIONS = new Set(['manual', 'dct', 'automatic', 'cvt']);

function trimToNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function sanitizeYear(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const yearInt = Math.trunc(n);
  const maxYear = new Date().getFullYear() + 1;
  if (yearInt < 1900 || yearInt > maxYear) return null;
  return yearInt;
}

function sanitizeFactoryHp(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function sanitizeTransmission(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return ALLOWED_TRANSMISSIONS.has(t) ? t : null;
}

route.get('/vehicles', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select().from(vehicles)
    .where(eq(vehicles.userId, userId))
    .orderBy(vehicles.name);
  return c.json(rows);
});

route.post('/vehicles', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    name: string; kind: string; mass_kg: number; drivetrain: string;
    frontal_area_m2?: number | null; drag_coefficient?: number | null; body_shape?: string | null;
    notes?: string;
    make?: string | null; model?: string | null; year?: number | string | null;
    tire_label?: string | null; power_hp_factory?: number | string | null;
    transmission?: string | null;
  }>();
  const now = new Date().toISOString();
  const [row] = await db.insert(vehicles).values({
    id: crypto.randomUUID(),
    userId,
    name: body.name,
    kind: body.kind,
    mass_kg: body.mass_kg,
    drivetrain: body.drivetrain,
    frontal_area_m2: body.frontal_area_m2 ?? null,
    drag_coefficient: body.drag_coefficient ?? null,
    body_shape: trimToNull(body.body_shape),
    notes: body.notes ?? '',
    make: trimToNull(body.make),
    model: trimToNull(body.model),
    year: sanitizeYear(body.year),
    tire_label: trimToNull(body.tire_label),
    power_hp_factory: sanitizeFactoryHp(body.power_hp_factory),
    transmission: sanitizeTransmission(body.transmission),
    created_at: now,
    updated_at: now,
  }).returning();
  return c.json(row, 201);
});

route.get('/vehicles/:vehicleId', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(vehicles)
    .where(and(eq(vehicles.id, c.req.param('vehicleId')), eq(vehicles.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.put('/vehicles/:vehicleId', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<Partial<{
    name: string; kind: string; mass_kg: number; drivetrain: string;
    frontal_area_m2: number | null; drag_coefficient: number | null; body_shape: string | null;
    notes: string;
    make: string | null; model: string | null; year: number | string | null;
    tire_label: string | null; power_hp_factory: number | string | null;
    transmission: string | null;
  }>>();
  const [row] = await db.update(vehicles)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.kind !== undefined && { kind: body.kind }),
      ...(body.mass_kg !== undefined && { mass_kg: body.mass_kg }),
      ...(body.drivetrain !== undefined && { drivetrain: body.drivetrain }),
      ...(body.frontal_area_m2 !== undefined && { frontal_area_m2: body.frontal_area_m2 }),
      ...(body.drag_coefficient !== undefined && { drag_coefficient: body.drag_coefficient }),
      ...(body.body_shape !== undefined && { body_shape: trimToNull(body.body_shape) }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.make !== undefined && { make: trimToNull(body.make) }),
      ...(body.model !== undefined && { model: trimToNull(body.model) }),
      ...(body.year !== undefined && { year: sanitizeYear(body.year) }),
      ...(body.tire_label !== undefined && { tire_label: trimToNull(body.tire_label) }),
      ...(body.power_hp_factory !== undefined && { power_hp_factory: sanitizeFactoryHp(body.power_hp_factory) }),
      ...(body.transmission !== undefined && { transmission: sanitizeTransmission(body.transmission) }),
      updated_at: new Date().toISOString(),
    })
    .where(and(eq(vehicles.id, c.req.param('vehicleId')), eq(vehicles.userId, userId)))
    .returning();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.delete('/vehicles/:vehicleId', async (c) => {
  const userId = c.get('userId');
  const vehicleId = c.req.param('vehicleId');
  const [existing] = await db.select({ id: vehicles.id }).from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)));
  if (!existing) return c.json({ error: 'Not found' }, 404);

  // No DB-level FK cascades — delete dependents (runs + their samples/curves,
  // calibrations, recordings) in one transaction before the vehicle itself.
  await db.transaction(async (tx) => {
    const vehicleRuns = await tx.select({ id: runs.id }).from(runs)
      .where(and(eq(runs.vehicle_id, vehicleId), eq(runs.userId, userId)));
    const runIds = vehicleRuns.map((r) => r.id);
    if (runIds.length > 0) {
      await tx.delete(derivedCurves).where(inArray(derivedCurves.run_id, runIds));
      await tx.delete(samples).where(inArray(samples.run_id, runIds));
    }
    await tx.delete(runs).where(and(eq(runs.vehicle_id, vehicleId), eq(runs.userId, userId)));
    await tx.delete(calibrations).where(and(eq(calibrations.vehicle_id, vehicleId), eq(calibrations.userId, userId)));
    await tx.delete(recordings).where(and(eq(recordings.vehicle_id, vehicleId), eq(recordings.userId, userId)));
    await tx.delete(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.userId, userId)));
  });
  return c.body(null, 204);
});

export { route as vehiclesRoute };
