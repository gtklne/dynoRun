import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { runs, samples, derivedCurves, vehicles, calibrations } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

const RUN_STATUSES = new Set(['in_progress', 'complete', 'degraded', 'aborted']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isFiniteOrNull(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value));
}

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
  }>().catch(() => null);
  if (!body || typeof body.vehicle_id !== 'string' || typeof body.calibration_id !== 'string') {
    return c.json({ error: 'vehicle_id and calibration_id are required' }, 400);
  }
  if (body.conditions !== undefined && !isPlainObject(body.conditions)) {
    return c.json({ error: 'conditions must be an object' }, 400);
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return c.json({ error: 'notes must be a string' }, 400);
  }

  const [[vehicle], [calibration]] = await Promise.all([
    db.select({ id: vehicles.id }).from(vehicles)
      .where(and(eq(vehicles.id, body.vehicle_id), eq(vehicles.userId, userId))),
    db.select({ id: calibrations.id, gear_label: calibrations.gear_label }).from(calibrations)
      .where(and(
        eq(calibrations.id, body.calibration_id),
        eq(calibrations.vehicle_id, body.vehicle_id),
        eq(calibrations.userId, userId),
      )),
  ]);
  if (!vehicle) return c.json({ error: 'Not found' }, 404);
  if (!calibration) return c.json({ error: 'Calibration not found for this vehicle' }, 404);

  const now = new Date().toISOString();
  const [row] = await db.insert(runs).values({
    id: crypto.randomUUID(),
    userId,
    vehicle_id: body.vehicle_id,
    calibration_id: body.calibration_id,
    // The calibration owns this value; accepting a client-supplied label here
    // allows a run to claim a gear other than the one its rollout came from.
    gear_label: calibration.gear_label,
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
    title?: string | null;
    peak_power_kw?: number | null;
    peak_torque_nm?: number | null;
    peak_power_rpm?: number | null;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);
  if (body.status !== undefined && (typeof body.status !== 'string' || !RUN_STATUSES.has(body.status))) {
    return c.json({ error: 'Invalid run status' }, 400);
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') return c.json({ error: 'notes must be a string' }, 400);
  if (body.title !== undefined && body.title !== null && typeof body.title !== 'string') return c.json({ error: 'title must be a string or null' }, 400);
  if (body.ended_at !== undefined && body.ended_at !== null && !isValidDate(body.ended_at)) return c.json({ error: 'ended_at must be a valid date or null' }, 400);
  if (body.conditions !== undefined && !isPlainObject(body.conditions)) return c.json({ error: 'conditions must be an object' }, 400);
  if (!isFiniteOrNull(body.peak_power_kw) || !isFiniteOrNull(body.peak_torque_nm) || !isFiniteOrNull(body.peak_power_rpm)) {
    return c.json({ error: 'Peak values must be finite numbers or null' }, 400);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.status !== undefined) patch.status = body.status;
  if (body.ended_at !== undefined) patch.ended_at = body.ended_at;
  if (body.conditions !== undefined) patch.conditions = JSON.stringify(body.conditions);
  if (body.title !== undefined) patch.title = body.title;
  if (body.peak_power_kw !== undefined) patch.peak_power_kw = body.peak_power_kw;
  if (body.peak_torque_nm !== undefined) patch.peak_torque_nm = body.peak_torque_nm;
  if (body.peak_power_rpm !== undefined) patch.peak_power_rpm = body.peak_power_rpm;
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
  await db.transaction(async (tx) => {
    await tx.delete(derivedCurves).where(eq(derivedCurves.run_id, runId));
    await tx.delete(samples).where(eq(samples.run_id, runId));
    await tx.delete(runs).where(eq(runs.id, runId));
  });
  return c.body(null, 204);
});

export { route as runsRoute };
