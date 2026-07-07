import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

// Edge-auth check for nginx `auth_request`. requireAuth returns 401 with no
// session; otherwise this returns 204. nginx uses the 2xx/401 split to gate
// static tools served outside the SPA (e.g. the Grip iframe at /grip-tool/).
// NOTE: mounted at /api/authz/* — deliberately NOT under /api/auth/**, which is
// owned by the better-auth catch-all. (better-auth's /api/auth/get-session
// returns 200 even when logged out, so it can't be used as an auth_request gate.)
const authzRoute = new Hono<{ Variables: AuthVariables }>();

authzRoute.get('/authz/check', requireAuth, (c) => c.body(null, 204));

export { authzRoute };
