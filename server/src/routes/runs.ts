import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { runs, samples, derivedCurves } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

route.get('/vehicles/:vehicleId/runs', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select().from(runs)
    .where(and(eq(runs.vehicle_id, c.req.param('vehicleId')), eq(runs.userId, userId)))
    .orderBy(runs.started_at);
  return c.json(rows.map((r) => ({ ...r, conditions: JSON.parse(r.conditions) })));
});

route.post('/runs', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    vehicle_id: string; calibration_id: string; gear_label: string;
    conditions?: object; notes?: string;
  }>();
  const now = new Date().toISOString();
  const [row] = await db.insert(runs).values({
    id: crypto.randomUUID(),
    userId,
    vehicle_id: body.vehicle_id,
    calibration_id: body.calibration_id,
    gear_label: body.gear_label,
    conditions: JSON.stringify(body.conditions ?? {}),
    notes: body.notes ?? '',
    status: 'in_progress',
    started_at: now,
    ended_at: null,
    created_at: now,
    updated_at: now,
  }).returning();
  return c.json({ ...row, conditions: JSON.parse(row.conditions) }, 201);
});

route.get('/runs/:id', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(runs)
    .where(and(eq(runs.id, c.req.param('id')), eq(runs.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...row, conditions: JSON.parse(row.conditions) });
});

route.patch('/runs/:id', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    notes?: string; status?: string; ended_at?: string; conditions?: object;
  }>();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.status !== undefined) patch.status = body.status;
  if (body.ended_at !== undefined) patch.ended_at = body.ended_at;
  if (body.conditions !== undefined) patch.conditions = JSON.stringify(body.conditions);
  const [row] = await db.update(runs).set(patch)
    .where(and(eq(runs.id, c.req.param('id')), eq(runs.userId, userId)))
    .returning();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...row, conditions: JSON.parse(row.conditions) });
});

route.delete('/runs/:id', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  const [existing] = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  if (!existing) return c.json({ error: 'Not found' }, 404);
  await db.delete(derivedCurves).where(eq(derivedCurves.run_id, runId));
  await db.delete(samples).where(eq(samples.run_id, runId));
  await db.delete(runs).where(eq(runs.id, runId));
  return c.body(null, 204);
});

export { route as runsRoute };
