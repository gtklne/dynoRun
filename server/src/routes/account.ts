import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { db, pool } from '../db.js';
import { vehicles, calibrations, runs, samples, derivedCurves, recordings } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

route.get('/account/export', async (c) => {
  const userId = c.get('userId');
  const [userResult, vehicleRows, calibrationRows, runRows, recordingRows] = await Promise.all([
    pool.query(
      `SELECT id, name, email, "emailVerified", "createdAt" FROM "user" WHERE id = $1`,
      [userId],
    ),
    db.select().from(vehicles).where(eq(vehicles.userId, userId)),
    db.select().from(calibrations).where(eq(calibrations.userId, userId)),
    db.select().from(runs).where(eq(runs.userId, userId)),
    db.select().from(recordings).where(eq(recordings.userId, userId)),
  ]);

  const runIds = runRows.map((r) => r.id);
  const [sampleRows, curveRows] = runIds.length > 0
    ? await Promise.all([
        db.select().from(samples).where(inArray(samples.run_id, runIds)),
        db.select().from(derivedCurves).where(inArray(derivedCurves.run_id, runIds)),
      ])
    : [[], []];

  return c.json({
    format_version: 1,
    exported_at: new Date().toISOString(),
    account: userResult.rows[0] ?? null,
    vehicles: vehicleRows,
    calibrations: calibrationRows,
    runs: runRows.map((r) => ({ ...r, conditions: JSON.parse(r.conditions) })),
    samples: sampleRows,
    derived_curves: curveRows,
    recordings: recordingRows,
  });
});

route.delete('/account', async (c) => {
  const userId = c.get('userId');
  const { rows } = await pool.query<{ email: string }>(`SELECT email FROM "user" WHERE id = $1`, [userId]);
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404);
  const email = rows[0].email;

  await db.transaction(async (tx) => {
    const userRuns = await tx.select({ id: runs.id }).from(runs).where(eq(runs.userId, userId));
    const runIds = userRuns.map((r) => r.id);
    if (runIds.length > 0) {
      await tx.delete(derivedCurves).where(inArray(derivedCurves.run_id, runIds));
      await tx.delete(samples).where(inArray(samples.run_id, runIds));
    }
    await tx.delete(runs).where(eq(runs.userId, userId));
    await tx.delete(calibrations).where(eq(calibrations.userId, userId));
    await tx.delete(recordings).where(eq(recordings.userId, userId));
    await tx.delete(vehicles).where(eq(vehicles.userId, userId));
  });

  // better-auth tables aren't drizzle-managed (see CLAUDE.md gotchas). Deleting
  // the user row cascades session/account via their FKs in init-auth-tables.sql,
  // but verification has no FK (keyed by identifier=email) and needs an explicit sweep.
  await pool.query(`DELETE FROM verification WHERE identifier = $1`, [email]);
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [userId]);

  return c.body(null, 204);
});

export { route as accountRoute };
