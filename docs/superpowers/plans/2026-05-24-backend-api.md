# Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Hono TypeScript REST API on the Hetzner server with PostgreSQL (Docker) and better-auth magic link authentication, replacing the local sql.js storage.

**Architecture:** A `server/` directory at the repo root contains a standalone Hono app. PostgreSQL runs in Docker on the same server with a persistent volume. better-auth handles magic link auth via Resend email. nginx proxies `/api/*` to the Hono process on port 3000.

**Tech Stack:** Hono, Drizzle ORM, node-postgres (`pg`), better-auth, Resend, PostgreSQL 16, systemd, Docker

---

## File Structure

```
server/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── src/
    ├── index.ts                      # Hono app: mounts auth + all routes
    ├── auth.ts                       # better-auth config with magic link + Resend
    ├── db.ts                         # pg Pool + Drizzle instance
    ├── schema.ts                     # Drizzle table definitions (all app tables)
    ├── middleware/
    │   └── require-auth.ts           # Verify session, attach userId to context
    └── routes/
        ├── vehicles.ts
        ├── calibrations.ts
        ├── runs.ts
        ├── samples.ts
        └── curves.ts
```

Infrastructure files (created on the server, not in git):
- `/etc/dynorun.env` — environment variables
- `/etc/systemd/system/dynorun-api.service` — systemd service
- `/etc/nginx/sites-available/dynorun` — updated nginx config (api proxy added)

---

### Task 1: Initialize server/ package

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/drizzle.config.ts`

- [ ] **Step 1: Create server/package.json**

```json
{
  "name": "dynorun-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --outDir dist",
    "start": "node dist/index.js",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "better-auth": "^1.2.7",
    "drizzle-orm": "^0.43.1",
    "hono": "^4.7.10",
    "pg": "^8.14.1",
    "resend": "^4.5.1"
  },
  "devDependencies": {
    "@types/pg": "^8.11.11",
    "drizzle-kit": "^0.31.1",
    "tsx": "^4.19.3",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 2: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create server/drizzle.config.ts**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Install dependencies**

```bash
cd server && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/tsconfig.json server/drizzle.config.ts server/package-lock.json
git commit -m "feat(server): initialize server package"
```

---

### Task 2: Database connection + Drizzle schema

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/schema.ts`

- [ ] **Step 1: Create server/src/db.ts**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

- [ ] **Step 2: Create server/src/schema.ts**

```ts
import {
  integer,
  pgTable,
  primaryKey,
  real,
  text,
} from 'drizzle-orm/pg-core';

export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  mass_kg: real('mass_kg').notNull(),
  drivetrain: text('drivetrain').notNull(),
  frontal_area_m2: real('frontal_area_m2'),
  drag_coefficient: real('drag_coefficient'),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const calibrations = pgTable('calibrations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  vehicle_id: text('vehicle_id').notNull(),
  gear_label: text('gear_label').notNull(),
  rpm: real('rpm').notNull(),
  speed_kmh: real('speed_kmh').notNull(),
  rollout_m_per_rev: real('rollout_m_per_rev').notNull(),
  recorded_at: text('recorded_at').notNull(),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  vehicle_id: text('vehicle_id').notNull(),
  calibration_id: text('calibration_id').notNull(),
  started_at: text('started_at').notNull(),
  ended_at: text('ended_at'),
  gear_label: text('gear_label').notNull(),
  conditions: text('conditions').notNull().default('{}'),
  notes: text('notes').notNull().default(''),
  status: text('status').notNull().default('in_progress'),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const samples = pgTable('samples', {
  run_id: text('run_id').notNull(),
  t_ms: integer('t_ms').notNull(),
  speed_mps: real('speed_mps').notNull(),
  accel_long_ms2: real('accel_long_ms2'),
  accel_vert_ms2: real('accel_vert_ms2'),
  lat: real('lat'),
  lon: real('lon'),
  hdop: real('hdop'),
}, (t) => [primaryKey({ columns: [t.run_id, t.t_ms] })]);

export const derivedCurves = pgTable('derived_curves', {
  run_id: text('run_id').primaryKey(),
  rpm_min: real('rpm_min').notNull(),
  rpm_max: real('rpm_max').notNull(),
  points: text('points').notNull(),
  pipeline_version: integer('pipeline_version').notNull(),
  computed_at: text('computed_at').notNull(),
});
```

- [ ] **Step 3: Commit**

```bash
git add server/src/db.ts server/src/schema.ts
git commit -m "feat(server): add database connection and Drizzle schema"
```

---

### Task 3: better-auth configuration

**Files:**
- Create: `server/src/auth.ts`

- [ ] **Step 1: Create server/src/auth.ts**

```ts
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { pg as pgAdapter } from 'better-auth/adapters/pg';
import { Resend } from 'resend';
import { pool } from './db.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: pgAdapter(pool),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.APP_URL!,
  trustedOrigins: [process.env.APP_URL!],
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: `DynoRun <${process.env.FROM_EMAIL}>`,
          to: email,
          subject: 'Sign in to DynoRun',
          html: `<p>Click the link below to sign in. It expires in 15 minutes.</p><p><a href="${url}">Sign in to DynoRun</a></p>`,
        });
      },
    }),
  ],
});
```

- [ ] **Step 2: Commit**

```bash
git add server/src/auth.ts
git commit -m "feat(server): add better-auth magic link configuration"
```

---

### Task 4: require-auth middleware

**Files:**
- Create: `server/src/middleware/require-auth.ts`

- [ ] **Step 1: Create server/src/middleware/require-auth.ts**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add server/src/middleware/require-auth.ts
git commit -m "feat(server): add require-auth middleware"
```

---

### Task 5: Vehicles route

**Files:**
- Create: `server/src/routes/vehicles.ts`

- [ ] **Step 1: Create server/src/routes/vehicles.ts**

```ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { vehicles } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

route.get('/', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select().from(vehicles)
    .where(eq(vehicles.userId, userId))
    .orderBy(vehicles.name);
  return c.json(rows);
});

route.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    name: string; kind: string; mass_kg: number; drivetrain: string;
    frontal_area_m2?: number | null; drag_coefficient?: number | null; notes?: string;
  }>();
  const now = new Date().toISOString();
  const [row] = await db.insert(vehicles).values({
    id: crypto.randomUUID(),
    userId,
    name: body.name,
    kind: body.kind,
    mass_kg: body.mass_kg,
    drivetrain: body.drivetrain,
    frontal_area_m2: body.frontal_area_m2 ?? null,
    drag_coefficient: body.drag_coefficient ?? null,
    notes: body.notes ?? '',
    created_at: now,
    updated_at: now,
  }).returning();
  return c.json(row, 201);
});

route.get('/:id', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(vehicles)
    .where(and(eq(vehicles.id, c.req.param('id')), eq(vehicles.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.put('/:id', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<Partial<{
    name: string; kind: string; mass_kg: number; drivetrain: string;
    frontal_area_m2: number | null; drag_coefficient: number | null; notes: string;
  }>>();
  const [row] = await db.update(vehicles)
    .set({ ...body, updated_at: new Date().toISOString() })
    .where(and(eq(vehicles.id, c.req.param('id')), eq(vehicles.userId, userId)))
    .returning();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.delete('/:id', async (c) => {
  const userId = c.get('userId');
  await db.delete(vehicles)
    .where(and(eq(vehicles.id, c.req.param('id')), eq(vehicles.userId, userId)));
  return c.body(null, 204);
});

export { route as vehiclesRoute };
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/vehicles.ts
git commit -m "feat(server): add vehicles route"
```

---

### Task 6: Calibrations route

**Files:**
- Create: `server/src/routes/calibrations.ts`

- [ ] **Step 1: Create server/src/routes/calibrations.ts**

```ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { calibrations } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

function computeRollout(rpm: number, speedKmh: number): number {
  return (speedKmh / 3.6) / (rpm / 60);
}

route.get('/vehicles/:vehicleId/calibrations', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select().from(calibrations)
    .where(and(
      eq(calibrations.vehicle_id, c.req.param('vehicleId')),
      eq(calibrations.userId, userId),
    ))
    .orderBy(calibrations.created_at);
  return c.json(rows);
});

route.post('/vehicles/:vehicleId/calibrations', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    gear_label: string; rpm: number; speed_kmh: number; notes?: string;
  }>();
  const now = new Date().toISOString();
  const [row] = await db.insert(calibrations).values({
    id: crypto.randomUUID(),
    userId,
    vehicle_id: c.req.param('vehicleId'),
    gear_label: body.gear_label,
    rpm: body.rpm,
    speed_kmh: body.speed_kmh,
    rollout_m_per_rev: computeRollout(body.rpm, body.speed_kmh),
    recorded_at: now,
    notes: body.notes ?? '',
    created_at: now,
    updated_at: now,
  }).returning();
  return c.json(row, 201);
});

route.get('/calibrations/:id', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(calibrations)
    .where(and(eq(calibrations.id, c.req.param('id')), eq(calibrations.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.delete('/calibrations/:id', async (c) => {
  const userId = c.get('userId');
  await db.delete(calibrations)
    .where(and(eq(calibrations.id, c.req.param('id')), eq(calibrations.userId, userId)));
  return c.body(null, 204);
});

export { route as calibrationsRoute };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/calibrations.ts
git commit -m "feat(server): add calibrations route"
```

---

### Task 7: Runs route

**Files:**
- Create: `server/src/routes/runs.ts`

- [ ] **Step 1: Create server/src/routes/runs.ts**

```ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { runs } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

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
  }>();
  const now = new Date().toISOString();
  const [row] = await db.insert(runs).values({
    id: crypto.randomUUID(),
    userId,
    vehicle_id: body.vehicle_id,
    calibration_id: body.calibration_id,
    gear_label: body.gear_label,
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
  }>();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.status !== undefined) patch.status = body.status;
  if (body.ended_at !== undefined) patch.ended_at = body.ended_at;
  if (body.conditions !== undefined) patch.conditions = JSON.stringify(body.conditions);
  const [row] = await db.update(runs).set(patch)
    .where(and(eq(runs.id, c.req.param('id')), eq(runs.userId, userId)))
    .returning();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...row, conditions: JSON.parse(row.conditions) });
});

route.delete('/runs/:id', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  // Verify ownership before deleting
  const [existing] = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  if (!existing) return c.json({ error: 'Not found' }, 404);
  // Cascade: delete child rows first (no FK constraints defined in schema)
  await db.delete(derivedCurves).where(eq(derivedCurves.run_id, runId));
  await db.delete(samples).where(eq(samples.run_id, runId));
  await db.delete(runs).where(eq(runs.id, runId));
  return c.body(null, 204);
});

export { route as runsRoute };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/runs.ts
git commit -m "feat(server): add runs route"
```

---

### Task 8: Samples route

**Files:**
- Create: `server/src/routes/samples.ts`

- [ ] **Step 1: Create server/src/routes/samples.ts**

```ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { samples, runs } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

async function runBelongsToUser(runId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  return !!row;
}

route.post('/runs/:id/samples', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<Array<{
    t_ms: number; speed_mps: number; accel_long_ms2?: number | null;
    accel_vert_ms2?: number | null; lat?: number | null; lon?: number | null; hdop?: number | null;
  }>>();
  if (body.length === 0) return c.json({ inserted: 0 });
  await db.insert(samples).values(body.map((s) => ({
    run_id: runId,
    t_ms: s.t_ms,
    speed_mps: s.speed_mps,
    accel_long_ms2: s.accel_long_ms2 ?? null,
    accel_vert_ms2: s.accel_vert_ms2 ?? null,
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    hdop: s.hdop ?? null,
  })));
  return c.json({ inserted: body.length });
});

route.get('/runs/:id/samples', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const rows = await db.select().from(samples)
    .where(eq(samples.run_id, runId))
    .orderBy(samples.t_ms);
  return c.json(rows);
});

export { route as samplesRoute };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/samples.ts
git commit -m "feat(server): add samples route"
```

---

### Task 9: Derived curves route

**Files:**
- Create: `server/src/routes/curves.ts`

- [ ] **Step 1: Create server/src/routes/curves.ts**

```ts
import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { db } from '../db.js';
import { derivedCurves, runs } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

async function runBelongsToUser(runId: string, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: runs.id }).from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));
  return !!row;
}

route.get('/runs/:id/curve', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const [row] = await db.select().from(derivedCurves).where(eq(derivedCurves.run_id, runId));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...row, points: JSON.parse(row.points) });
});

route.put('/runs/:id/curve', async (c) => {
  const userId = c.get('userId');
  const runId = c.req.param('id');
  if (!await runBelongsToUser(runId, userId)) return c.json({ error: 'Not found' }, 404);
  const body = await c.req.json<{
    rpm_min: number; rpm_max: number; points: unknown[]; pipeline_version: number;
  }>();
  const [row] = await db.insert(derivedCurves).values({
    run_id: runId,
    rpm_min: body.rpm_min,
    rpm_max: body.rpm_max,
    points: JSON.stringify(body.points),
    pipeline_version: body.pipeline_version,
    computed_at: new Date().toISOString(),
  })
  .onConflictDoUpdate({
    target: derivedCurves.run_id,
    set: {
      rpm_min: body.rpm_min,
      rpm_max: body.rpm_max,
      points: JSON.stringify(body.points),
      pipeline_version: body.pipeline_version,
      computed_at: new Date().toISOString(),
    },
  })
  .returning();
  return c.json({ ...row, points: JSON.parse(row.points) });
});

export { route as curvesRoute };
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/curves.ts
git commit -m "feat(server): add derived curves route"
```

---

### Task 10: Hono app entry

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Create server/src/index.ts**

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth.js';
import { vehiclesRoute } from './routes/vehicles.js';
import { calibrationsRoute } from './routes/calibrations.js';
import { runsRoute } from './routes/runs.js';
import { samplesRoute } from './routes/samples.js';
import { curvesRoute } from './routes/curves.js';

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

const port = parseInt(process.env.PORT ?? '3000', 10);
console.log(`DynoRun API listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && npm run build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): add Hono app entry with all routes mounted"
```

---

### Task 11: Server infrastructure

This task runs SSH commands against `138.199.154.225`. All commands use `ssh -i ~/.ssh/dynorun_deploy`.

**Files (on server, not git):**
- `/etc/dynorun.env`
- `/etc/systemd/system/dynorun-api.service`
- `/etc/nginx/sites-available/dynorun` (update)

- [ ] **Step 1: Start PostgreSQL in Docker**

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 "
  apt-get install -y docker.io &&
  systemctl enable docker &&
  systemctl start docker &&
  docker run -d \
    --name postgres \
    --restart always \
    -e POSTGRES_USER=dynorun \
    -e POSTGRES_PASSWORD=changeme \
    -e POSTGRES_DB=dynorun \
    -p 127.0.0.1:5432:5432 \
    -v /var/lib/pg-data:/var/lib/postgresql/data \
    postgres:16
"
```

Expected: container ID printed. Verify: `docker ps` shows `postgres` running.

- [ ] **Step 2: Wait for Postgres to be ready**

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 \
  "until docker exec postgres pg_isready -U dynorun; do sleep 1; done && echo ready"
```

Expected: `ready`

- [ ] **Step 3: Sign up for Resend and get API key**

Go to https://resend.com, create a free account, copy the API key (`re_...`).

- [ ] **Step 4: Write /etc/dynorun.env on server**

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 "cat > /etc/dynorun.env << 'EOF'
DATABASE_URL=postgresql://dynorun:changeme@localhost:5432/dynorun
RESEND_API_KEY=re_REPLACE_WITH_YOUR_KEY
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
APP_URL=http://138.199.154.225
FROM_EMAIL=onboarding@resend.dev
PORT=3000
EOF"
```

Then open the file and replace `re_REPLACE_WITH_YOUR_KEY` with your actual Resend API key:

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 "nano /etc/dynorun.env"
```

- [ ] **Step 5: Install Node.js on server**

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 "
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - &&
  apt-get install -y nodejs
"
```

Expected: `node --version` prints `v22.x.x`.

- [ ] **Step 6: Create API deployment directory**

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 "
  mkdir -p /opt/dynorun-api &&
  chown deploy:deploy /opt/dynorun-api
"
```

- [ ] **Step 7: Write systemd service file**

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 "cat > /etc/systemd/system/dynorun-api.service << 'EOF'
[Unit]
Description=DynoRun API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/dynorun-api
EnvironmentFile=/etc/dynorun.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable dynorun-api"
```

- [ ] **Step 8: Update nginx config to proxy /api/**

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 "cat > /etc/nginx/sites-available/dynorun << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/dynorun;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
nginx -t && systemctl reload nginx"
```

Expected: `nginx: configuration file ... test is successful`

- [ ] **Step 9: Commit infrastructure notes**

```bash
git commit --allow-empty -m "chore(server): provision infrastructure on dynorun-prod"
```

---

### Task 12: Update CI/CD for API deployment

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add deploy-api job to .github/workflows/deploy.yml**

Replace the entire file content with:

```yaml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-production
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          printf '%s\n' "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H "${{ secrets.DEPLOY_HOST }}" >> ~/.ssh/known_hosts

      - name: Deploy frontend
        run: |
          rsync -rlgoDzv --delete -e "ssh -i ~/.ssh/id_ed25519" dist/ "deploy@${{ secrets.DEPLOY_HOST }}:/var/www/dynorun/"

  deploy-api:
    needs: deploy
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: server/package-lock.json

      - name: Build API
        run: |
          cd server && npm ci && npm run build

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          printf '%s\n' "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H "${{ secrets.DEPLOY_HOST }}" >> ~/.ssh/known_hosts

      - name: Deploy API
        run: |
          rsync -rlgoDzv --delete -e "ssh -i ~/.ssh/id_ed25519" \
            --exclude 'node_modules' \
            server/dist/ "deploy@${{ secrets.DEPLOY_HOST }}:/opt/dynorun-api/dist/"
          rsync -rlgoDzv -e "ssh -i ~/.ssh/id_ed25519" \
            server/package.json server/package-lock.json \
            "deploy@${{ secrets.DEPLOY_HOST }}:/opt/dynorun-api/"

      - name: Install production deps + run migrations + restart
        run: |
          ssh -i ~/.ssh/id_ed25519 "deploy@${{ secrets.DEPLOY_HOST }}" \
            "cd /opt/dynorun-api && npm ci --omit=dev"
          ssh -i ~/.ssh/id_ed25519 "deploy@${{ secrets.DEPLOY_HOST }}" \
            "cd /opt/dynorun-api && DATABASE_URL=\$(grep DATABASE_URL /etc/dynorun.env | cut -d= -f2-) npx drizzle-kit migrate || true"
          ssh -i ~/.ssh/id_ed25519 "deploy@${{ secrets.DEPLOY_HOST }}" \
            "sudo systemctl restart dynorun-api"
```

**Note:** The `sudo systemctl restart` requires deploy user to have passwordless sudo for that one command. Add to `/etc/sudoers.d/deploy` on the server:

```bash
ssh -i ~/.ssh/dynorun_deploy root@138.199.154.225 \
  "echo 'deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart dynorun-api' > /etc/sudoers.d/deploy"
```

- [ ] **Step 2: Run the first migration manually (before CI takes over)**

```bash
ssh -i ~/.ssh/dynorun_deploy deploy@138.199.154.225 \
  "cd /opt/dynorun-api && source /etc/dynorun.env && npx drizzle-kit push"
```

Wait — `drizzle-kit` is a dev dependency and won't be in the production install. Use `drizzle-kit push` locally pointing at the remote DB instead, via SSH tunnel:

```bash
ssh -i ~/.ssh/dynorun_deploy -L 5432:localhost:5432 deploy@138.199.154.225 -N &
SSH_PID=$!
cd server && DATABASE_URL=postgresql://dynorun:changeme@localhost:5432/dynorun npm run db:push
kill $SSH_PID
```

Expected: Drizzle prints the tables it created.

- [ ] **Step 3: Commit and push to trigger CI**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add deploy-api job to GitHub Actions"
git push
```

Expected: both `deploy` and `deploy-api` jobs pass in GitHub Actions.

---

### Task 13: Smoke test

- [ ] **Step 1: Verify the API is running**

```bash
curl -s http://138.199.154.225/api/auth/session
```

Expected: `{"session":null}` or similar (not a 502 gateway error).

- [ ] **Step 2: Request a magic link**

```bash
curl -s -X POST http://138.199.154.225/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"j.nothstein@iwf.ch"}'
```

Expected: `{"status":"OK"}` — check your email for the magic link.

- [ ] **Step 3: Click the magic link**

Open the magic link from the email in a browser. You should be redirected to `/` and a session cookie set.

- [ ] **Step 4: Test an authenticated endpoint (from browser DevTools)**

In the browser that has the session cookie:

```js
fetch('/api/vehicles', { credentials: 'include' }).then(r => r.json()).then(console.log)
```

Expected: `[]` (empty array — no vehicles yet, but authenticated successfully).
