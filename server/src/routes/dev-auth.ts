import { Hono } from 'hono';
import { serializeSignedCookie } from 'better-call';
import { auth } from '../auth.js';

/**
 * Dev-only login bypass. Mints a real better-auth session for an email and sets
 * the session cookie directly — skipping the magic-link email + Turnstile
 * captcha that make local sign-in painful (no inbox to click on dev).
 *
 * This route is mounted in index.ts ONLY when DEV_LOGIN === 'true', which is set
 * in server/.env locally and absent from prod's /etc/dynorun.env. The inner guard
 * (plus the NODE_ENV check) is defence-in-depth so it can never activate in prod
 * even if the flag leaks in. Same find-or-create semantics as the magic-link
 * verify handler, so it grants exactly the access a real sign-in would.
 */
export const devAuthRoute = new Hono();

devAuthRoute.post('/dev/login', async (c) => {
  if (process.env.DEV_LOGIN !== 'true' || process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not found' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email ?? process.env.DEV_LOGIN_EMAIL ?? '').trim().toLowerCase();
  if (!email) return c.json({ error: 'email required' }, 400);

  const ctx = await auth.$context;
  let user = (await ctx.internalAdapter.findUserByEmail(email))?.user;
  if (!user) {
    user = await ctx.internalAdapter.createUser({
      email,
      emailVerified: true,
      name: email.split('@')[0],
    });
  }

  const session = await ctx.internalAdapter.createSession(user.id);
  const cookie = await serializeSignedCookie(
    ctx.authCookies.sessionToken.name,
    session.token,
    ctx.secret,
    { ...ctx.authCookies.sessionToken.attributes, maxAge: ctx.sessionConfig.expiresIn },
  );
  c.header('set-cookie', cookie);

  // `role` is a better-auth additional field, absent from the base User type.
  const role = (user as { role?: string }).role;
  return c.json({ user: { id: user.id, email: user.email, role } });
});
