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

const app = new Hono();

app.use(cors({
  origin: process.env.APP_URL!,
  credentials: true,
}));

// better-auth handles all /api/auth/* routes
app.on(['GET', 'POST'], '/api/auth/**', (c) => auth.handler(c.req.raw));

// App routes
app.route('/api', vehiclesRoute);
app.route('/api', calibrationsRoute);
app.route('/api', runsRoute);
app.route('/api', samplesRoute);
app.route('/api', curvesRoute);
app.route('/api', recordingsRoute);

const port = parseInt(process.env.PORT ?? '3000', 10);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`DynoRun API listening on :${port}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
