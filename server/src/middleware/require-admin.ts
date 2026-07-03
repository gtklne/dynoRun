import type { MiddlewareHandler } from 'hono';
import { auth } from '../auth.js';
import { pool } from '../db.js';

export type AdminVariables = { userId: string };

// Answers 404 (not 403) for anyone who isn't an admin, so the /api/admin
// surface is indistinguishable from a nonexistent route to regular users.
// The role is re-read from the database on every request rather than trusted
// from the session payload, so a revoked admin loses access immediately.
export const requireAdmin: MiddlewareHandler<{ Variables: AdminVariables }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'Not found' }, 404);
  }
  const { rows } = await pool.query<{ role: string }>(
    'SELECT role FROM "user" WHERE id = $1',
    [session.user.id],
  );
  if (rows[0]?.role !== 'admin') {
    return c.json({ error: 'Not found' }, 404);
  }
  c.set('userId', session.user.id);
  await next();
};
