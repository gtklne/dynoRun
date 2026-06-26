import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { samples } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';
import { runBelongsToUser } from '../lib/run-belongs-to-user.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

route.post('/runs/:id/samples', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<Array<{
    t_ms: number; speed_mps: number; accel_long_ms2?: number | null;
    accel_vert_ms2?: number | null; lat?: number | null; lon?: number | null; hdop?: number | null;
    altitude_m?: number | null;
  }>>();
  if (body.length === 0) return c.json({ inserted: 0 });
  await db.insert(samples).values(body.map((s) => ({
    run_id: runId,
    // t_ms is an integer column; clients derive it from performance.now() which
    // can carry sub-ms float drift (e.g. 9197.000000000002). Round defensively so
    // a stray float never rejects the whole batch and strands the run mid-analysis.
    t_ms: Math.round(s.t_ms),
    speed_mps: s.speed_mps,
    accel_long_ms2: s.accel_long_ms2 ?? null,
    accel_vert_ms2: s.accel_vert_ms2 ?? null,
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    hdop: s.hdop ?? null,
    altitude_m: s.altitude_m ?? null,
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
