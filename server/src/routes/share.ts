import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { runs, vehicles, derivedCurves } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const authedRoute = new Hono<{ Variables: AuthVariables }>();
authedRoute.use(requireAuth);

function buildShareUrl(token: string): string {
  // The SPA lives under the /dynorun/ subpath of the suite domain. APP_URL is
  // the origin (no subpath). Keep in sync with client shareUrlFor().
  const base = process.env.APP_URL ?? 'https://wasgoht.ch';
  return `${base.replace(/\/$/, '')}/dynorun/share/${token}`;
}

authedRoute.post('/runs/:id/share-token', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  const [existing] = await db.select({
    id: runs.id, share_token: runs.share_token,
  }).from(runs).where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.share_token) {
    return c.json({ token: existing.share_token, url: buildShareUrl(existing.share_token) });
  }
  const token = crypto.randomUUID();
  await db.update(runs)
    .set({ share_token: token, updated_at: new Date().toISOString() })
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  return c.json({ token, url: buildShareUrl(token) }, 201);
});

authedRoute.delete('/runs/:id/share-token', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  const result = await db.update(runs)
    .set({ share_token: null, updated_at: new Date().toISOString() })
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .returning({ id: runs.id });
  if (result.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.body(null, 204);
});

const publicRoute = new Hono();

publicRoute.get('/share/:token', async (c) => {
  const token = c.req.param('token');
  const [row] = await db.select({
    run_id: runs.id,
    started_at: runs.started_at,
    ended_at: runs.ended_at,
    gear_label: runs.gear_label,
    status: runs.status,
    title: runs.title,
    peak_power_kw: runs.peak_power_kw,
    peak_torque_nm: runs.peak_torque_nm,
    peak_power_rpm: runs.peak_power_rpm,
    conditions: runs.conditions,
    vehicle_id: vehicles.id,
    vehicle_name: vehicles.name,
    vehicle_kind: vehicles.kind,
  }).from(runs)
    .innerJoin(vehicles, eq(vehicles.id, runs.vehicle_id))
    .where(eq(runs.share_token, token));
  if (!row) return c.json({ error: 'Not found' }, 404);
  const [curveRow] = await db.select().from(derivedCurves)
    .where(eq(derivedCurves.run_id, row.run_id));
  if (!curveRow) return c.json({ error: 'Not found' }, 404);
  return c.json({
    run: {
      id: row.run_id,
      started_at: row.started_at,
      ended_at: row.ended_at,
      gear_label: row.gear_label,
      status: row.status,
      title: row.title,
      peak_power_kw: row.peak_power_kw,
      peak_torque_nm: row.peak_torque_nm,
      peak_power_rpm: row.peak_power_rpm,
      conditions: JSON.parse(row.conditions),
    },
    vehicle: {
      id: row.vehicle_id,
      name: row.vehicle_name,
      kind: row.vehicle_kind,
    },
    curve: { ...curveRow, points: JSON.parse(curveRow.points) },
  });
});

export { authedRoute as shareTokenRoute, publicRoute as publicShareRoute };
