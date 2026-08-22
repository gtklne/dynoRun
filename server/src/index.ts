import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { auth, enabledSocialProviders, NATIVE_ORIGINS } from './auth.js';
import { vehiclesRoute } from './routes/vehicles.js';
import { calibrationsRoute } from './routes/calibrations.js';
import { runsRoute } from './routes/runs.js';
import { samplesRoute } from './routes/samples.js';
import { curvesRoute } from './routes/curves.js';
import { recordingsRoute } from './routes/recordings.js';
import { gripSessionsRoute } from './routes/grip-sessions.js';
import { shareTokenRoute, publicShareRoute } from './routes/share.js';
import { adminRoute } from './routes/admin.js';
import { accountRoute } from './routes/account.js';
import { devAuthRoute } from './routes/dev-auth.js';

const app = new Hono();

// Native builds run in a Capacitor webview, which is a different origin from
// the web app even though both talk to this same API.
app.use(cors({
  origin: [process.env.APP_URL!, ...NATIVE_ORIGINS],
  credentials: true,
  // The bearer plugin returns the session token in this header on native
  // sign-in; without exposing it the webview's fetch cannot read it.
  exposeHeaders: ['set-auth-token'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-captcha-response'],
}));

// Public: tells the login screen which social buttons to render. Social
// providers are registered only when their credentials are present (see
// auth.ts), so hardcoding the buttons client-side would show a Sign in with
// Apple button that dead-ends until the Apple keys are provisioned.
app.get('/api/auth-providers', (c) => c.json({ providers: enabledSocialProviders }));

// better-auth handles all /api/auth/* routes
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

// Dev-only login bypass (skips password + captcha). Mounted only when
// DEV_LOGIN is explicitly enabled, never registered in prod, so the route
// surface stays absent there.
if (process.env.DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production') {
  app.route('/api', devAuthRoute);
  console.warn('⚠  DEV_LOGIN enabled, POST /api/dev/login bypasses email auth');
}

// Public share route: must mount before any auth-gated routes so a logged-out
// browser can read a shared run without redirecting to /login.
app.route('/api', publicShareRoute);

// App routes (each sub-route applies requireAuth internally)
app.route('/api', vehiclesRoute);
app.route('/api', calibrationsRoute);
app.route('/api', runsRoute);
app.route('/api', samplesRoute);
app.route('/api', curvesRoute);
app.route('/api', recordingsRoute);
app.route('/api', gripSessionsRoute);
app.route('/api', shareTokenRoute);
app.route('/api', adminRoute);
app.route('/api', accountRoute);

const port = parseInt(process.env.PORT ?? '3000', 10);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`DynoRun API listening on :${port}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
