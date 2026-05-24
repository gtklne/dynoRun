import type { MiddlewareHandler } from 'hono';
import { auth } from '../auth.js';

export type AuthVariables = { userId: string };

export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  c.set('userId', session.user.id);
  await next();
};
