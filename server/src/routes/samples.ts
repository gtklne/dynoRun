import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { samples, runs } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

async function runBelongsToUser(runId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  return !!row;
}

route.post('/runs/:id/samples', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<Array<{
    t_ms: number; speed_mps: number; accel_long_ms2?: number | null;
    accel_vert_ms2?: number | null; lat?: number | null; lon?: number | null; hdop?: number | null;
  }>>();
  if (body.length === 0) return c.json({ inserted: 0 });
  await db.insert(samples).values(body.map((s) => ({
    run_id: runId,
    t_ms: s.t_ms,
    speed_mps: s.speed_mps,
    accel_long_ms2: s.accel_long_ms2 ?? null,
    accel_vert_ms2: s.accel_vert_ms2 ?? null,
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    hdop: s.hdop ?? null,
  })));
  return c.json({ inserted: body.length });
});

route.get('/runs/:id/samples', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const rows = await db.select().from(samples)
    .where(eq(samples.run_id, runId))
    .orderBy(samples.t_ms);
  return c.json(rows);
});

export { route as samplesRoute };
