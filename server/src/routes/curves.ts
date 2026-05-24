import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { derivedCurves, runs } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

async function runBelongsToUser(runId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  return !!row;
}

route.get('/runs/:id/curve', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const [row] = await db.select().from(derivedCurves).where(eq(derivedCurves.run_id, runId));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...row, points: JSON.parse(row.points) });
});

route.put('/runs/:id/curve', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<{
    rpm_min: number; rpm_max: number; points: unknown[]; pipeline_version: number;
  }>();
  const [row] = await db.insert(derivedCurves).values({
    run_id: runId,
    rpm_min: body.rpm_min,
    rpm_max: body.rpm_max,
    points: JSON.stringify(body.points),
    pipeline_version: body.pipeline_version,
    computed_at: new Date().toISOString(),
  })
  .onConflictDoUpdate({
    target: derivedCurves.run_id,
    set: {
      rpm_min: body.rpm_min,
      rpm_max: body.rpm_max,
      points: JSON.stringify(body.points),
      pipeline_version: body.pipeline_version,
      computed_at: new Date().toISOString(),
    },
  })
  .returning();
  return c.json({ ...row, points: JSON.parse(row.points) });
});

export { route as curvesRoute };
