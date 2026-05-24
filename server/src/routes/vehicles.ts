import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { vehicles } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

route.get('/', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select().from(vehicles)
    .where(eq(vehicles.userId, userId))
    .orderBy(vehicles.name);
  return c.json(rows);
});

route.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    name: string; kind: string; mass_kg: number; drivetrain: string;
    frontal_area_m2?: number | null; drag_coefficient?: number | null; notes?: string;
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
    notes: body.notes ?? '',
    created_at: now,
    updated_at: now,
  }).returning();
  return c.json(row, 201);
});

route.get('/:id', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(vehicles)
    .where(and(eq(vehicles.id, c.req.param('id')), eq(vehicles.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.put('/:id', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<Partial<{
    name: string; kind: string; mass_kg: number; drivetrain: string;
    frontal_area_m2: number | null; drag_coefficient: number | null; notes: string;
  }>>();
  const [row] = await db.update(vehicles)
    .set({ ...body, updated_at: new Date().toISOString() })
    .where(and(eq(vehicles.id, c.req.param('id')), eq(vehicles.userId, userId)))
    .returning();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.delete('/:id', async (c) => {
  const userId = c.get('userId');
  await db.delete(vehicles)
    .where(and(eq(vehicles.id, c.req.param('id')), eq(vehicles.userId, userId)));
  return c.body(null, 204);
});

export { route as vehiclesRoute };
