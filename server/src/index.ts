import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { auth } from './auth.js';
import { vehiclesRoute } from './routes/vehicles.js';
import { calibrationsRoute } from './routes/calibrations.js';
import { runsRoute } from './routes/runs.js';
import { samplesRoute } from './routes/samples.js';
import { curvesRoute } from './routes/curves.js';
import { recordingsRoute } from './routes/recordings.js';
import { shareTokenRoute, publicShareRoute } from './routes/share.js';

const app = new Hono();

app.use(cors({
  origin: process.env.APP_URL!,
  credentials: true,
}));

// better-auth handles all /api/auth/* routes
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

// Public share route — must mount before any auth-gated routes so a logged-out
// browser can read a shared run without redirecting to /login.
app.route('/api', publicShareRoute);

// App routes (each sub-route applies requireAuth internally)
app.route('/api', vehiclesRoute);
app.route('/api', calibrationsRoute);
app.route('/api', runsRoute);
app.route('/api', samplesRoute);
app.route('/api', curvesRoute);
app.route('/api', recordingsRoute);
app.route('/api', shareTokenRoute);

const port = parseInt(process.env.PORT ?? '3000', 10);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`DynoRun API listening on :${port}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
