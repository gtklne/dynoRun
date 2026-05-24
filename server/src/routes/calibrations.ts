import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { calibrations } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

function computeRollout(rpm: number, speedKmh: number): number {
  return (speedKmh / 3.6) / (rpm / 60);
}

route.get('/vehicles/:vehicleId/calibrations', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select().from(calibrations)
    .where(and(
      eq(calibrations.vehicle_id, c.req.param('vehicleId')),
      eq(calibrations.userId, userId),
    ))
    .orderBy(calibrations.created_at);
  return c.json(rows);
});

route.post('/vehicles/:vehicleId/calibrations', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    gear_label: string; rpm: number; speed_kmh: number; notes?: string;
  }>();
  const now = new Date().toISOString();
  const [row] = await db.insert(calibrations).values({
    id: crypto.randomUUID(),
    userId,
    vehicle_id: c.req.param('vehicleId'),
    gear_label: body.gear_label,
    rpm: body.rpm,
    speed_kmh: body.speed_kmh,
    rollout_m_per_rev: computeRollout(body.rpm, body.speed_kmh),
    recorded_at: now,
    notes: body.notes ?? '',
    created_at: now,
    updated_at: now,
  }).returning();
  return c.json(row, 201);
});

route.get('/calibrations/:id', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(calibrations)
    .where(and(eq(calibrations.id, c.req.param('id')), eq(calibrations.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.delete('/calibrations/:id', async (c) => {
  const userId = c.get('userId');
  await db.delete(calibrations)
    .where(and(eq(calibrations.id, c.req.param('id')), eq(calibrations.userId, userId)));
  return c.body(null, 204);
});

export { route as calibrationsRoute };
