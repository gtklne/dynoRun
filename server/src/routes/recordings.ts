import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { recordings } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

// List all recordings for the current user (metadata only, no sample data)
route.get('/recordings', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select({
    id: recordings.id,
    kind: recordings.kind,
    vehicle_id: recordings.vehicle_id,
    calibration_id: recordings.calibration_id,
    run_id: recordings.run_id,
    gear_label: recordings.gear_label,
    user_rpm: recordings.user_rpm,
    label: recordings.label,
    recorded_at: recordings.recorded_at,
    duration_ms: recordings.duration_ms,
    gps_count: recordings.gps_count,
    motion_count: recordings.motion_count,
    created_at: recordings.created_at,
  })
    .from(recordings)
    .where(eq(recordings.userId, userId))
    .orderBy(desc(recordings.recorded_at));
  return c.json(rows);
});

// Fetch a single recording with full sample data
route.get('/recordings/:id', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(recordings)
    .where(and(eq(recordings.id, c.req.param('id')), eq(recordings.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// Create a new recording
route.post('/recordings', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    kind: 'run' | 'calibration';
    vehicle_id?: string | null;
    calibration_id?: string | null;
    run_id?: string | null;
    gear_label?: string | null;
    user_rpm?: number | null;
    label?: string | null;
    recorded_at: string;
    duration_ms: number;
    data: { gps_fixes: unknown[]; motion_fixes: unknown[] };
  }>();

  if (body.kind !== 'run' && body.kind !== 'calibration') {
    return c.json({ error: 'invalid kind' }, 400);
  }
  if (!body.data || !Array.isArray(body.data.gps_fixes) || !Array.isArray(body.data.motion_fixes)) {
    return c.json({ error: 'invalid data shape' }, 400);
  }

  const now = new Date().toISOString();
  const [row] = await db.insert(recordings).values({
    id: crypto.randomUUID(),
    userId,
    kind: body.kind,
    vehicle_id: body.vehicle_id ?? null,
    calibration_id: body.calibration_id ?? null,
    run_id: body.run_id ?? null,
    gear_label: body.gear_label ?? null,
    user_rpm: body.user_rpm ?? null,
    label: body.label ?? null,
    recorded_at: body.recorded_at,
    duration_ms: body.duration_ms,
    gps_count: body.data.gps_fixes.length,
    motion_count: body.data.motion_fixes.length,
    data: body.data,
    created_at: now,
  }).returning();

  return c.json(row, 201);
});

// Patch metadata (label only for now)
route.patch('/recordings/:id', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ label?: string | null }>();
  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label;
  if (Object.keys(patch).length === 0) return c.json({ error: 'no fields' }, 400);
  const [row] = await db.update(recordings).set(patch)
    .where(and(eq(recordings.id, c.req.param('id')), eq(recordings.userId, userId)))
    .returning();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.delete('/recordings/:id', async (c) => {
  const userId = c.get('userId');
  const result = await db.delete(recordings)
    .where(and(eq(recordings.id, c.req.param('id')), eq(recordings.userId, userId)))
    .returning({ id: recordings.id });
  if (result.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.body(null, 204);
});

export { route as recordingsRoute };
