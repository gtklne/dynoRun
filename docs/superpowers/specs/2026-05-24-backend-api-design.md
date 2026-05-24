# Backend API Design

## Goal

Replace the local sql.js storage with a server-side PostgreSQL database and a Hono REST API. Add magic link authentication via better-auth. The frontend calls this API instead of querying a local SQLite DB.

## Sub-projects

This feature is split into two sequential specs:
1. **This spec** — Backend API (Hono + PostgreSQL + better-auth + Resend)
2. `2026-05-24-frontend-integration-design.md` — Frontend rewrite (API client + login UI)

---

## Infrastructure

### Server layout (Hetzner `dynorun-prod`, `138.199.154.225`)

```
┌─────────────────────────────────┐
│  nginx :80                      │
│  /api/*  → proxy_pass :3000     │
│  /*      → /var/www/dynorun/    │
├─────────────────────────────────┤
│  Hono API  :3000  (systemd)     │
├─────────────────────────────────┤
│  PostgreSQL :5432 (Docker)      │
│  volume: /var/lib/pg-data       │
└─────────────────────────────────┘
```

- PostgreSQL runs in Docker with a bind-mounted volume at `/var/lib/pg-data` for persistence.
- The Hono API runs as a systemd service (`dynorun-api.service`), started on boot, restarted on failure.
- nginx gains a `/api/` proxy block — all other traffic continues to serve the SPA.

### Environment file

`/etc/dynorun.env` on the server (never committed):

```
DATABASE_URL=postgresql://dynorun:changeme@localhost:5432/dynorun
RESEND_API_KEY=re_...
BETTER_AUTH_SECRET=<64-char random string>
APP_URL=http://138.199.154.225
FROM_EMAIL=onboarding@resend.dev
PORT=3000
```

`FROM_EMAIL` defaults to Resend's shared sender (`onboarding@resend.dev`) which works without a verified domain. Once a domain is set up, update this to `noreply@yourdomain.com`.

---

## Repository structure

```
server/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── src/
    ├── index.ts              # Hono app entry, mounts all routes
    ├── auth.ts               # better-auth config (magic link + pg adapter)
    ├── db.ts                 # Drizzle + node-postgres pool
    ├── schema.ts             # Drizzle schema (mirrors existing SQLite tables)
    ├── middleware/
    │   └── require-auth.ts   # Verifies better-auth session, attaches user to ctx
    └── routes/
        ├── vehicles.ts
        ├── calibrations.ts
        ├── runs.ts
        ├── samples.ts
        └── curves.ts
```

---

## Database schema

PostgreSQL schema mirrors the existing SQLite schema exactly. Drizzle manages migrations (`drizzle-kit push` or `drizzle-kit generate` + `migrate`).

### Tables

**better-auth manages:** `user`, `session`, `verification` (auto-created by better-auth's pg adapter)

**App tables** (same as existing SQLite, `user_id` now a real FK to `user.id`):

```sql
vehicles       (id, user_id FK, name, kind, mass_kg, drivetrain,
                frontal_area_m2, drag_coefficient, notes,
                created_at, updated_at)

calibrations   (id, user_id FK, vehicle_id FK, gear_label, rpm,
                speed_kmh, rollout_m_per_rev, recorded_at, notes,
                created_at, updated_at)

runs           (id, user_id FK, vehicle_id FK, calibration_id FK,
                started_at, ended_at, gear_label, conditions JSONB,
                notes, status, created_at, updated_at)

samples        (run_id FK, t_ms, speed_mps, accel_long_ms2,
                accel_vert_ms2, lat, lon, hdop,
                PRIMARY KEY (run_id, t_ms))

derived_curves (run_id FK PRIMARY KEY, rpm_min, rpm_max,
                points JSONB, pipeline_version, computed_at)
```

`synced_at` columns are dropped — they were for local→server sync which is no longer needed.

---

## Authentication (better-auth + Resend)

### Library choices
- **better-auth** — handles magic link token generation, email dispatch, JWT session creation
- **Resend** — transactional email (100 emails/day free, simple API)

### Magic link flow

```
1. POST /api/auth/magic-link         { email }
   → better-auth generates token, stores in `verification` table
   → Resend sends: "Sign in to DynoRun → http://<APP_URL>/api/auth/magic-link/verify?token=..."
   → 200 OK { message: "Check your email" }

2. GET /api/auth/magic-link/verify?token=...
   → better-auth validates token (15-min expiry)
   → Creates session row, sets Set-Cookie: session=<jwt>; HttpOnly; SameSite=Lax
   → Redirects to /

3. POST /api/auth/sign-out
   → Deletes session row, clears cookie
```

Sessions are stored in an HttpOnly cookie — no localStorage, no manual JWT handling on the frontend.

### better-auth config (`server/src/auth.ts`)

```ts
import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { pg } from "better-auth/adapters/pg";
import { Resend } from "resend";
import { pool } from "./db";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: pg(pool),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.APP_URL!,
  trustedOrigins: [process.env.APP_URL!],
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await resend.emails.send({
          from: `DynoRun <${process.env.FROM_EMAIL}>`,
          to: email,
          subject: "Sign in to DynoRun",
          html: `<p><a href="${url}">Click here to sign in</a></p><p>Link expires in 15 minutes.</p>`,
        });
      },
    }),
  ],
});
```

---

## API endpoints

All endpoints under `/api/` except auth routes. All non-auth routes require a valid session (enforced by `require-auth` middleware).

```
AUTH (handled by better-auth):
  POST   /api/auth/magic-link
  GET    /api/auth/magic-link/verify
  POST   /api/auth/sign-out
  GET    /api/auth/session

VEHICLES:
  GET    /api/vehicles              list current user's vehicles
  POST   /api/vehicles              create vehicle
  GET    /api/vehicles/:id          get vehicle
  PUT    /api/vehicles/:id          update vehicle
  DELETE /api/vehicles/:id          delete vehicle

CALIBRATIONS:
  GET    /api/vehicles/:id/calibrations        list for vehicle
  POST   /api/vehicles/:id/calibrations        create
  GET    /api/calibrations/:id                 get
  DELETE /api/calibrations/:id                 delete

RUNS:
  GET    /api/vehicles/:id/runs     list runs for vehicle
  POST   /api/runs                  create run (status=in_progress)
  GET    /api/runs/:id              get run
  PATCH  /api/runs/:id              update run (notes, status, ended_at)
  DELETE /api/runs/:id              delete run + cascade samples/curve

SAMPLES:
  POST   /api/runs/:id/samples      bulk insert samples array
  GET    /api/runs/:id/samples      get all samples for run

DERIVED CURVES:
  GET    /api/runs/:id/curve        get derived curve
  PUT    /api/runs/:id/curve        upsert derived curve
```

All list endpoints only return rows where `user_id = session.userId` — no cross-user data leakage.

---

## CI/CD additions

GitHub Actions `deploy.yml` gains a second job that runs after the frontend deploy:

```yaml
deploy-api:
  needs: deploy          # waits for frontend deploy
  runs-on: ubuntu-latest
  steps:
    - checkout + node setup
    - npm ci --prefix server
    - rsync server/ deploy@<host>:/opt/dynorun-api/
    - ssh: cd /opt/dynorun-api && npm ci --omit=dev
    - ssh: systemctl restart dynorun-api
```

Server bootstrap (one-time, done during Task 3 equivalent):
- `docker run -d --name postgres --restart always -e POSTGRES_* -v /var/lib/pg-data:/var/lib/postgresql/data postgres:16`
- Write `/etc/systemd/system/dynorun-api.service`
- Write `/etc/nginx/sites-available/dynorun` with `/api/` proxy block

---

## Tech stack

| Concern | Choice | Reason |
|---|---|---|
| HTTP framework | Hono | Lightweight, TypeScript-native, fast |
| ORM + migrations | Drizzle ORM | Type-safe, lightweight, good PostgreSQL support |
| DB driver | node-postgres (`pg`) | Standard PostgreSQL driver |
| Auth | better-auth | Magic link built-in, pg adapter, HttpOnly cookie sessions |
| Email | Resend | Simple API, 100 free emails/day |
| Database | PostgreSQL 16 (Docker) | Robust, same schema as existing SQLite design |
