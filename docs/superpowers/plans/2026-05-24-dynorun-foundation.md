# DynoRun Foundation Implementation Plan (Phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless foundation of DynoRun — project scaffolding, storage, sensor abstraction, the full analysis pipeline (raw GPS samples → wheel-power curve), and a minimal Garage UI plus a fixture-replay demo that proves end-to-end correctness without needing a real car.

**Architecture:** TypeScript monorepo as a single Vite + React app, designed to be wrapped by Capacitor in Phase 3. Strict one-way module dependencies (UI → run/analysis → sensors + storage). Pure functions in the analysis pipeline. Repository pattern over a `Database` interface with sql.js (web) and Capacitor SQLite (native) implementations sharing identical SQL. Sensor sources implement a uniform `SensorSource<T>` interface so OBD-II can be added later without touching the analysis pipeline.

**Tech Stack:** Vite, React 18, TypeScript 5 (strict), Vitest, React Testing Library, sql.js (web), `@capacitor-community/sqlite` (native), uPlot, React Router v6. No state-management library, no RxJS — hand-rolled `Subject<T>` for sensor streams.

---

## File structure produced by this plan

```
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
index.html
src/
  main.tsx
  App.tsx
  shared/
    types.ts                       # SI/units types
    units.ts                       # kmhToMps, mpsToKmh, etc.
    observable.ts                  # Subject<T> + Observable<T>
    uuid.ts                        # newId()
    iso-time.ts                    # nowIso(), monotonicMs()
  storage/
    database.ts                    # Database interface
    database-web.ts                # sql.js implementation
    database-factory.ts            # platform-selecting factory (Capacitor impl stubbed for Plan 3)
    migrations/
      001_initial.sql
      runner.ts                    # applies pending migrations on boot
    repositories/
      vehicle-repository.ts
      calibration-repository.ts
      run-repository.ts
      sample-repository.ts
      derived-curve-repository.ts
  sensors/
    types.ts                       # SensorSample, SensorSource, Capability
    mock-speed-source.ts
    mock-accel-source.ts
    derived-rpm-source.ts
    sensor-registry.ts
  analysis/
    types.ts                       # AnalyzedRun, RpmPoint, etc.
    resample.ts
    smooth.ts                      # Savitzky-Golay
    differentiate.ts
    rpm-from-speed.ts
    power-torque.ts
    rpm-bin.ts
    pipeline.ts                    # analyzeRun() orchestrator
  ui/
    app-shell.tsx
    garage/
      garage-screen.tsx
      vehicle-form.tsx
      vehicle-detail.tsx
    fixture-replay/
      fixture-replay-screen.tsx    # demo screen
    components/
      power-curve-chart.tsx        # static uPlot chart for derived curves
tests/
  fixtures/
    sample-run-3rd-gear.json
  storage/
    vehicle-repository.test.ts
    calibration-repository.test.ts
    run-repository.test.ts
    sample-repository.test.ts
    derived-curve-repository.test.ts
  sensors/
    mock-speed-source.test.ts
    derived-rpm-source.test.ts
  analysis/
    resample.test.ts
    smooth.test.ts
    differentiate.test.ts
    rpm-from-speed.test.ts
    power-torque.test.ts
    rpm-bin.test.ts
    pipeline.test.ts
  e2e/
    fixture-to-curve.test.ts
```

---

## Phase A — Project scaffolding

### Task 1: Initialize Vite + React + TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules
dist
.DS_Store
*.log
.vite
coverage
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "dynorun",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "sql.js": "^1.11.0",
    "uplot": "^1.6.31"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@types/sql.js": "^1.4.9",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.3",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": false,
    "allowSyntheticDefaultImports": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  optimizeDeps: { exclude: ['sql.js'] },
});
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>DynoRun</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 8: Create `src/App.tsx`**

```tsx
export default function App() {
  return <div>DynoRun — boot OK</div>;
}
```

- [ ] **Step 9: Install dependencies and verify build**

Run: `npm install`
Run: `npm run typecheck`
Expected: exits 0
Run: `npm run build`
Expected: exits 0, `dist/` created

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + TS project"
```

### Task 2: Set up Vitest with jsdom

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Modify: `package.json` (already has scripts; verify)

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Add a smoke test to confirm Vitest runs**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: configure vitest with jsdom"
```

---

## Phase B — Shared foundation

### Task 3: Shared `units.ts`, `uuid.ts`, `iso-time.ts`

**Files:**
- Create: `src/shared/units.ts`
- Create: `src/shared/uuid.ts`
- Create: `src/shared/iso-time.ts`
- Test: `tests/shared/units.test.ts`

- [ ] **Step 1: Write failing test for unit conversions**

`tests/shared/units.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { kmhToMps, mpsToKmh, rpmToRadPerSec } from '@/shared/units';

describe('units', () => {
  it('converts km/h to m/s', () => {
    expect(kmhToMps(36)).toBeCloseTo(10);
  });
  it('converts m/s to km/h', () => {
    expect(mpsToKmh(10)).toBeCloseTo(36);
  });
  it('converts RPM to rad/s', () => {
    expect(rpmToRadPerSec(60)).toBeCloseTo(2 * Math.PI);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- units`
Expected: FAIL ("cannot find module")

- [ ] **Step 3: Implement `src/shared/units.ts`**

```ts
export const kmhToMps = (kmh: number): number => kmh / 3.6;
export const mpsToKmh = (mps: number): number => mps * 3.6;
export const rpmToRadPerSec = (rpm: number): number => (rpm * 2 * Math.PI) / 60;
export const radPerSecToRpm = (w: number): number => (w * 60) / (2 * Math.PI);
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- units`
Expected: 3 passed

- [ ] **Step 5: Implement `src/shared/uuid.ts`**

```ts
export const newId = (): string => crypto.randomUUID();
```

- [ ] **Step 6: Implement `src/shared/iso-time.ts`**

```ts
export const nowIso = (): string => new Date().toISOString();
export const monotonicMs = (): number => performance.now();
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shared): units, uuid, iso-time helpers"
```

### Task 4: `Subject<T>` / `Observable<T>`

**Files:**
- Create: `src/shared/observable.ts`
- Test: `tests/shared/observable.test.ts`

- [ ] **Step 1: Write failing test**

`tests/shared/observable.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { Subject } from '@/shared/observable';

describe('Subject', () => {
  it('delivers values to subscribers', () => {
    const s = new Subject<number>();
    const spy = vi.fn();
    s.subscribe(spy);
    s.next(1);
    s.next(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 1);
    expect(spy).toHaveBeenNthCalledWith(2, 2);
  });

  it('unsubscribe stops delivery', () => {
    const s = new Subject<number>();
    const spy = vi.fn();
    const unsub = s.subscribe(spy);
    s.next(1);
    unsub();
    s.next(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers receive same value', () => {
    const s = new Subject<number>();
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a);
    s.subscribe(b);
    s.next(42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- observable`
Expected: FAIL

- [ ] **Step 3: Implement `src/shared/observable.ts`**

```ts
export type Unsubscribe = () => void;
export type Observer<T> = (value: T) => void;

export interface Observable<T> {
  subscribe(observer: Observer<T>): Unsubscribe;
}

export class Subject<T> implements Observable<T> {
  private observers = new Set<Observer<T>>();

  subscribe(observer: Observer<T>): Unsubscribe {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  next(value: T): void {
    for (const o of this.observers) o(value);
  }

  complete(): void {
    this.observers.clear();
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- observable`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): Subject/Observable primitive"
```

### Task 5: Domain types in `shared/types.ts`

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create the file with all domain types**

```ts
export type UUID = string;
export type IsoTime = string;

export type VehicleKind = 'car' | 'motorcycle';
export type Drivetrain = 'fwd' | 'rwd' | 'awd' | 'chain' | 'shaft';
export type RunStatus = 'complete' | 'degraded' | 'aborted';

export interface Vehicle {
  id: UUID;
  user_id: UUID | null;
  name: string;
  kind: VehicleKind;
  mass_kg: number;
  drivetrain: Drivetrain;
  frontal_area_m2: number | null;
  drag_coefficient: number | null;
  notes: string;
  created_at: IsoTime;
  updated_at: IsoTime;
  synced_at: IsoTime | null;
}

export interface Calibration {
  id: UUID;
  user_id: UUID | null;
  vehicle_id: UUID;
  gear_label: string;
  rpm: number;
  speed_kmh: number;
  rollout_m_per_rev: number;
  recorded_at: IsoTime;
  notes: string;
  created_at: IsoTime;
  updated_at: IsoTime;
  synced_at: IsoTime | null;
}

export interface RunConditions {
  ambient_temp_c?: number;
  wind_kmh?: number;
  road_slope_pct?: number;
  surface?: string;
}

export interface Run {
  id: UUID;
  user_id: UUID | null;
  vehicle_id: UUID;
  calibration_id: UUID;
  started_at: IsoTime;
  ended_at: IsoTime | null;
  gear_label: string;
  conditions: RunConditions;
  notes: string;
  status: RunStatus;
  created_at: IsoTime;
  updated_at: IsoTime;
  synced_at: IsoTime | null;
}

export interface Sample {
  run_id: UUID;
  t_ms: number;
  speed_mps: number;
  accel_long_ms2: number | null;
  accel_vert_ms2: number | null;
  lat: number | null;
  lon: number | null;
  hdop: number | null;
}

export interface RpmPoint {
  rpm: number;
  wheel_power_kw: number;
  wheel_torque_nm: number;
}

export interface DerivedCurve {
  run_id: UUID;
  rpm_min: number;
  rpm_max: number;
  points: RpmPoint[];
  pipeline_version: number;
  computed_at: IsoTime;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(shared): domain types"
```

---

## Phase C — Storage layer

### Task 6: `Database` interface + sql.js implementation

**Files:**
- Create: `src/storage/database.ts`
- Create: `src/storage/database-web.ts`
- Create: `src/storage/database-factory.ts`
- Test: `tests/storage/database-web.test.ts`

- [ ] **Step 1: Define interface in `src/storage/database.ts`**

```ts
export type SqlParam = string | number | null | Uint8Array;
export type Row = Record<string, SqlParam>;

export interface Database {
  execute(sql: string, params?: SqlParam[]): Promise<void>;
  query<T extends Row = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

- [ ] **Step 2: Write failing test for sql.js implementation**

`tests/storage/database-web.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import type { Database } from '@/storage/database';

describe('WebDatabase', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
  });

  it('executes DDL and inserts rows', async () => {
    await db.execute('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)');
    await db.execute('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 1]);
    const rows = await db.query<{ id: string; n: number }>('SELECT * FROM t');
    expect(rows).toEqual([{ id: 'a', n: 1 }]);
  });

  it('rolls back on transaction failure', async () => {
    await db.execute('CREATE TABLE t (id TEXT PRIMARY KEY)');
    await db.execute('INSERT INTO t (id) VALUES (?)', ['a']);
    await expect(
      db.transaction(async () => {
        await db.execute('INSERT INTO t (id) VALUES (?)', ['b']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.query('SELECT id FROM t ORDER BY id');
    expect(rows).toEqual([{ id: 'a' }]);
  });
});
```

- [ ] **Step 3: Run, see failure**

Run: `npm test -- database-web`
Expected: FAIL

- [ ] **Step 4: Implement `src/storage/database-web.ts`**

```ts
import initSqlJs, { Database as SqlJsDb } from 'sql.js';
import type { Database, Row, SqlParam } from './database';

export async function createWebDatabase(_name: string): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  const sqlDb: SqlJsDb = new SQL.Database();

  const execute = async (sql: string, params: SqlParam[] = []): Promise<void> => {
    sqlDb.run(sql, params as never);
  };

  const query = async <T extends Row = Row>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<T[]> => {
    const stmt = sqlDb.prepare(sql);
    stmt.bind(params as never);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    stmt.free();
    return out;
  };

  const transaction = async <T>(work: () => Promise<T>): Promise<T> => {
    sqlDb.run('BEGIN');
    try {
      const result = await work();
      sqlDb.run('COMMIT');
      return result;
    } catch (err) {
      sqlDb.run('ROLLBACK');
      throw err;
    }
  };

  const close = async (): Promise<void> => {
    sqlDb.close();
  };

  return { execute, query, transaction, close };
}
```

- [ ] **Step 5: Make sql.js wasm load from node_modules in test env**

The sql.js wasm fetch needs to work in jsdom. Update `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';

// Make sql.js wasm available in jsdom by stubbing fetch for its wasm path.
const wasmPath = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.endsWith('sql-wasm.wasm')) {
    const buf = fs.readFileSync(wasmPath);
    return new Response(buf, { headers: { 'content-type': 'application/wasm' } });
  }
  return originalFetch(input as never, init);
}) as typeof fetch;
```

- [ ] **Step 6: Run test, expect pass**

Run: `npm test -- database-web`
Expected: 2 passed

- [ ] **Step 7: Stub the factory**

`src/storage/database-factory.ts`:

```ts
import type { Database } from './database';
import { createWebDatabase } from './database-web';

export async function createDatabase(name: string): Promise<Database> {
  return createWebDatabase(name);
}
```

(Capacitor-native implementation is added in Plan 3.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(storage): Database interface + sql.js impl"
```

### Task 7: Migrations runner + initial schema

**Files:**
- Create: `src/storage/migrations/001_initial.sql`
- Create: `src/storage/migrations/runner.ts`
- Test: `tests/storage/migrations.test.ts`

- [ ] **Step 1: Write the initial schema SQL**

The runner creates `schema_versions` itself, so the migration file only contains the domain tables.

`src/storage/migrations/001_initial.sql`:

```sql
CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('car','motorcycle')),
  mass_kg REAL NOT NULL,
  drivetrain TEXT NOT NULL CHECK (drivetrain IN ('fwd','rwd','awd','chain','shaft')),
  frontal_area_m2 REAL,
  drag_coefficient REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE TABLE calibrations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  gear_label TEXT NOT NULL,
  rpm REAL NOT NULL,
  speed_kmh REAL NOT NULL,
  rollout_m_per_rev REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);
CREATE INDEX idx_calibrations_vehicle ON calibrations(vehicle_id);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  calibration_id TEXT NOT NULL REFERENCES calibrations(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  gear_label TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('complete','degraded','aborted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);
CREATE INDEX idx_runs_vehicle ON runs(vehicle_id);

CREATE TABLE samples (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL,
  speed_mps REAL NOT NULL,
  accel_long_ms2 REAL,
  accel_vert_ms2 REAL,
  lat REAL,
  lon REAL,
  hdop REAL,
  PRIMARY KEY (run_id, t_ms)
);

CREATE TABLE derived_curves (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  rpm_min REAL NOT NULL,
  rpm_max REAL NOT NULL,
  points TEXT NOT NULL,
  pipeline_version INTEGER NOT NULL,
  computed_at TEXT NOT NULL
);
```

- [ ] **Step 2: Write failing test for the runner**

`tests/storage/migrations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';

describe('migrations runner', () => {
  let db: Awaited<ReturnType<typeof createWebDatabase>>;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
  });

  it('applies initial schema on a fresh database', async () => {
    await runMigrations(db);
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    expect(names).toContain('vehicles');
    expect(names).toContain('calibrations');
    expect(names).toContain('runs');
    expect(names).toContain('samples');
    expect(names).toContain('derived_curves');
    expect(names).toContain('schema_versions');
  });

  it('is idempotent', async () => {
    await runMigrations(db);
    await runMigrations(db);
    const versions = await db.query<{ version: number }>(
      'SELECT version FROM schema_versions',
    );
    expect(versions).toEqual([{ version: 1 }]);
  });
});
```

- [ ] **Step 3: Run, see failure**

Run: `npm test -- migrations`
Expected: FAIL

- [ ] **Step 4: Implement `src/storage/migrations/runner.ts`**

```ts
import type { Database } from '../database';
import { nowIso } from '@/shared/iso-time';
import initialSql from './001_initial.sql?raw';

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [{ version: 1, sql: initialSql }];

export async function runMigrations(db: Database): Promise<void> {
  await ensureVersionsTable(db);
  const applied = await loadAppliedVersions(db);
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await db.transaction(async () => {
      for (const stmt of splitSql(m.sql)) {
        if (stmt.trim()) await db.execute(stmt);
      }
      await db.execute(
        'INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)',
        [m.version, nowIso()],
      );
    });
  }
}

async function ensureVersionsTable(db: Database): Promise<void> {
  const tbl = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'",
  );
  if (tbl.length === 0) {
    await db.execute(
      'CREATE TABLE schema_versions (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
  }
}

async function loadAppliedVersions(db: Database): Promise<Set<number>> {
  const rows = await db.query<{ version: number }>('SELECT version FROM schema_versions');
  return new Set(rows.map((r) => r.version));
}

function splitSql(sql: string): string[] {
  return sql.split(/;\s*$/m);
}
```

- [ ] **Step 5: Add Vite raw-SQL import support**

Vite supports `?raw` imports at runtime, but TypeScript needs a declaration. Create `src/sql-raw.d.ts`:

```ts
declare module '*.sql?raw' {
  const content: string;
  export default content;
}
```

- [ ] **Step 6: Run test, expect pass**

Run: `npm test -- migrations`
Expected: 2 passed

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(storage): migrations runner + initial schema"
```

### Task 8: VehicleRepository

**Files:**
- Create: `src/storage/repositories/vehicle-repository.ts`
- Test: `tests/storage/vehicle-repository.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/storage/vehicle-repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import type { Database } from '@/storage/database';

describe('VehicleRepository', () => {
  let db: Database;
  let repo: VehicleRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    repo = new VehicleRepository(db);
  });

  it('creates and reads a vehicle', async () => {
    const v = await repo.create({
      name: 'Civic',
      kind: 'car',
      mass_kg: 1300,
      drivetrain: 'fwd',
      frontal_area_m2: null,
      drag_coefficient: null,
      notes: '',
    });
    expect(v.id).toMatch(/[0-9a-f-]+/);
    const got = await repo.get(v.id);
    expect(got?.name).toBe('Civic');
    expect(got?.mass_kg).toBe(1300);
  });

  it('lists vehicles ordered by name', async () => {
    await repo.create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    await repo.create({ name: 'Aprilia', kind: 'motorcycle', mass_kg: 200, drivetrain: 'chain', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const list = await repo.list();
    expect(list.map((v) => v.name)).toEqual(['Aprilia', 'Civic']);
  });

  it('updates a vehicle and bumps updated_at', async () => {
    const v = await repo.create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const before = v.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.update(v.id, { mass_kg: 1350 });
    expect(updated.mass_kg).toBe(1350);
    expect(updated.updated_at > before).toBe(true);
  });

  it('deletes a vehicle', async () => {
    const v = await repo.create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    await repo.delete(v.id);
    expect(await repo.get(v.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- vehicle-repository`
Expected: FAIL

- [ ] **Step 3: Implement `src/storage/repositories/vehicle-repository.ts`**

```ts
import type { Database } from '../database';
import type { Vehicle, VehicleKind, Drivetrain } from '@/shared/types';
import { newId } from '@/shared/uuid';
import { nowIso } from '@/shared/iso-time';

export interface NewVehicle {
  name: string;
  kind: VehicleKind;
  mass_kg: number;
  drivetrain: Drivetrain;
  frontal_area_m2: number | null;
  drag_coefficient: number | null;
  notes: string;
}

export class VehicleRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewVehicle): Promise<Vehicle> {
    const id = newId();
    const now = nowIso();
    const v: Vehicle = {
      id,
      user_id: null,
      ...input,
      created_at: now,
      updated_at: now,
      synced_at: null,
    };
    await this.db.execute(
      `INSERT INTO vehicles
        (id, user_id, name, kind, mass_kg, drivetrain, frontal_area_m2, drag_coefficient, notes, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.id, v.user_id, v.name, v.kind, v.mass_kg, v.drivetrain, v.frontal_area_m2, v.drag_coefficient, v.notes, v.created_at, v.updated_at, v.synced_at],
    );
    return v;
  }

  async get(id: string): Promise<Vehicle | null> {
    const rows = await this.db.query<Vehicle>('SELECT * FROM vehicles WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async list(): Promise<Vehicle[]> {
    return this.db.query<Vehicle>('SELECT * FROM vehicles ORDER BY name');
  }

  async update(id: string, patch: Partial<NewVehicle>): Promise<Vehicle> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`vehicle not found: ${id}`);
    const merged: Vehicle = {
      ...existing,
      ...patch,
      updated_at: nowIso(),
    };
    await this.db.execute(
      `UPDATE vehicles SET
         name = ?, kind = ?, mass_kg = ?, drivetrain = ?,
         frontal_area_m2 = ?, drag_coefficient = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
      [merged.name, merged.kind, merged.mass_kg, merged.drivetrain, merged.frontal_area_m2, merged.drag_coefficient, merged.notes, merged.updated_at, id],
    );
    return merged;
  }

  async delete(id: string): Promise<void> {
    await this.db.execute('DELETE FROM vehicles WHERE id = ?', [id]);
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- vehicle-repository`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(storage): VehicleRepository"
```

### Task 9: CalibrationRepository

**Files:**
- Create: `src/storage/repositories/calibration-repository.ts`
- Test: `tests/storage/calibration-repository.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/storage/calibration-repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import type { Database } from '@/storage/database';

describe('CalibrationRepository', () => {
  let db: Database;
  let vehicles: VehicleRepository;
  let cals: CalibrationRepository;
  let vehicleId: string;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    vehicles = new VehicleRepository(db);
    cals = new CalibrationRepository(db);
    const v = await vehicles.create({
      name: 'Civic',
      kind: 'car',
      mass_kg: 1300,
      drivetrain: 'fwd',
      frontal_area_m2: null,
      drag_coefficient: null,
      notes: '',
    });
    vehicleId = v.id;
  });

  it('creates a calibration with computed rollout', async () => {
    const c = await cals.create({
      vehicle_id: vehicleId,
      gear_label: '3rd',
      rpm: 3000,
      speed_kmh: 80,
      notes: '',
    });
    // rollout (m/rev) = speed_mps / (rpm/60) = 22.222 / 50 = 0.4444
    expect(c.rollout_m_per_rev).toBeCloseTo(80 / 3.6 / (3000 / 60), 4);
  });

  it('lists calibrations for a vehicle', async () => {
    await cals.create({ vehicle_id: vehicleId, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    await cals.create({ vehicle_id: vehicleId, gear_label: '4th', rpm: 3000, speed_kmh: 100, notes: '' });
    const list = await cals.listByVehicle(vehicleId);
    expect(list).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- calibration-repository`
Expected: FAIL

- [ ] **Step 3: Implement `src/storage/repositories/calibration-repository.ts`**

```ts
import type { Database } from '../database';
import type { Calibration } from '@/shared/types';
import { newId } from '@/shared/uuid';
import { nowIso } from '@/shared/iso-time';
import { kmhToMps } from '@/shared/units';

export interface NewCalibration {
  vehicle_id: string;
  gear_label: string;
  rpm: number;
  speed_kmh: number;
  notes: string;
}

export class CalibrationRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewCalibration): Promise<Calibration> {
    const id = newId();
    const now = nowIso();
    const rollout = computeRollout(input.rpm, input.speed_kmh);
    const c: Calibration = {
      id,
      user_id: null,
      vehicle_id: input.vehicle_id,
      gear_label: input.gear_label,
      rpm: input.rpm,
      speed_kmh: input.speed_kmh,
      rollout_m_per_rev: rollout,
      recorded_at: now,
      notes: input.notes,
      created_at: now,
      updated_at: now,
      synced_at: null,
    };
    await this.db.execute(
      `INSERT INTO calibrations
        (id, user_id, vehicle_id, gear_label, rpm, speed_kmh, rollout_m_per_rev, recorded_at, notes, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.user_id, c.vehicle_id, c.gear_label, c.rpm, c.speed_kmh, c.rollout_m_per_rev, c.recorded_at, c.notes, c.created_at, c.updated_at, c.synced_at],
    );
    return c;
  }

  async get(id: string): Promise<Calibration | null> {
    const rows = await this.db.query<Calibration>('SELECT * FROM calibrations WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async listByVehicle(vehicleId: string): Promise<Calibration[]> {
    return this.db.query<Calibration>(
      'SELECT * FROM calibrations WHERE vehicle_id = ? ORDER BY created_at DESC',
      [vehicleId],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.execute('DELETE FROM calibrations WHERE id = ?', [id]);
  }
}

export function computeRollout(rpm: number, speedKmh: number): number {
  // m/rev = (m/s) / (rev/s) = (speed_mps) / (rpm / 60)
  return kmhToMps(speedKmh) / (rpm / 60);
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- calibration-repository`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(storage): CalibrationRepository + rollout calc"
```

### Task 10: RunRepository + SampleRepository

**Files:**
- Create: `src/storage/repositories/run-repository.ts`
- Create: `src/storage/repositories/sample-repository.ts`
- Test: `tests/storage/run-repository.test.ts`
- Test: `tests/storage/sample-repository.test.ts`

- [ ] **Step 1: Write failing test for RunRepository**

`tests/storage/run-repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import type { Database } from '@/storage/database';

describe('RunRepository', () => {
  let db: Database;
  let vehicleId: string;
  let calibrationId: string;
  let runs: RunRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({
      name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    vehicleId = v.id;
    const c = await new CalibrationRepository(db).create({
      vehicle_id: vehicleId, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '',
    });
    calibrationId = c.id;
    runs = new RunRepository(db);
  });

  it('creates a run with conditions JSON round-trip', async () => {
    const r = await runs.create({
      vehicle_id: vehicleId,
      calibration_id: calibrationId,
      gear_label: '3rd',
      conditions: { ambient_temp_c: 20, surface: 'asphalt' },
      notes: 'baseline',
    });
    const got = await runs.get(r.id);
    expect(got?.conditions).toEqual({ ambient_temp_c: 20, surface: 'asphalt' });
    expect(got?.status).toBe('complete');
  });

  it('lists runs for a vehicle newest first', async () => {
    const a = await runs.create({ vehicle_id: vehicleId, calibration_id: calibrationId, gear_label: '3rd', conditions: {}, notes: '' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await runs.create({ vehicle_id: vehicleId, calibration_id: calibrationId, gear_label: '3rd', conditions: {}, notes: '' });
    const list = await runs.listByVehicle(vehicleId);
    expect(list.map((r) => r.id)).toEqual([b.id, a.id]);
  });

  it('updates status', async () => {
    const r = await runs.create({ vehicle_id: vehicleId, calibration_id: calibrationId, gear_label: '3rd', conditions: {}, notes: '' });
    await runs.markDegraded(r.id);
    const got = await runs.get(r.id);
    expect(got?.status).toBe('degraded');
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- run-repository`
Expected: FAIL

- [ ] **Step 3: Implement `src/storage/repositories/run-repository.ts`**

```ts
import type { Database } from '../database';
import type { Run, RunConditions, RunStatus } from '@/shared/types';
import { newId } from '@/shared/uuid';
import { nowIso } from '@/shared/iso-time';

export interface NewRun {
  vehicle_id: string;
  calibration_id: string;
  gear_label: string;
  conditions: RunConditions;
  notes: string;
}

interface RunRow extends Omit<Run, 'conditions'> {
  conditions: string;
}

export class RunRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewRun): Promise<Run> {
    const id = newId();
    const now = nowIso();
    const r: Run = {
      id,
      user_id: null,
      vehicle_id: input.vehicle_id,
      calibration_id: input.calibration_id,
      started_at: now,
      ended_at: null,
      gear_label: input.gear_label,
      conditions: input.conditions,
      notes: input.notes,
      status: 'complete',
      created_at: now,
      updated_at: now,
      synced_at: null,
    };
    await this.db.execute(
      `INSERT INTO runs
        (id, user_id, vehicle_id, calibration_id, started_at, ended_at, gear_label, conditions, notes, status, created_at, updated_at, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.user_id, r.vehicle_id, r.calibration_id, r.started_at, r.ended_at, r.gear_label, JSON.stringify(r.conditions), r.notes, r.status, r.created_at, r.updated_at, r.synced_at],
    );
    return r;
  }

  async get(id: string): Promise<Run | null> {
    const rows = await this.db.query<RunRow>('SELECT * FROM runs WHERE id = ?', [id]);
    if (!rows[0]) return null;
    return { ...rows[0], conditions: JSON.parse(rows[0].conditions) };
  }

  async listByVehicle(vehicleId: string): Promise<Run[]> {
    const rows = await this.db.query<RunRow>(
      'SELECT * FROM runs WHERE vehicle_id = ? ORDER BY started_at DESC',
      [vehicleId],
    );
    return rows.map((r) => ({ ...r, conditions: JSON.parse(r.conditions) }));
  }

  async markDegraded(id: string): Promise<void> {
    await this.setStatus(id, 'degraded');
  }

  async markAborted(id: string): Promise<void> {
    await this.setStatus(id, 'aborted');
  }

  async finalize(id: string, endedAt: string): Promise<void> {
    await this.db.execute(
      'UPDATE runs SET ended_at = ?, updated_at = ? WHERE id = ?',
      [endedAt, nowIso(), id],
    );
  }

  private async setStatus(id: string, status: RunStatus): Promise<void> {
    await this.db.execute(
      'UPDATE runs SET status = ?, updated_at = ? WHERE id = ?',
      [status, nowIso(), id],
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.execute('DELETE FROM runs WHERE id = ?', [id]);
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- run-repository`
Expected: 3 passed

- [ ] **Step 5: Write failing test for SampleRepository**

`tests/storage/sample-repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import type { Database } from '@/storage/database';
import type { Sample } from '@/shared/types';

describe('SampleRepository', () => {
  let db: Database;
  let runId: string;
  let samples: SampleRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const c = await new CalibrationRepository(db).create({ vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    const r = await new RunRepository(db).create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '' });
    runId = r.id;
    samples = new SampleRepository(db);
  });

  it('inserts many samples in one batch and reads them back ordered', async () => {
    const input: Sample[] = [
      { run_id: runId, t_ms: 0, speed_mps: 10, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null },
      { run_id: runId, t_ms: 100, speed_mps: 11, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null },
      { run_id: runId, t_ms: 200, speed_mps: 12, accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null },
    ];
    await samples.insertMany(input);
    const got = await samples.listByRun(runId);
    expect(got).toEqual(input);
  });
});
```

- [ ] **Step 6: Run, see failure**

Run: `npm test -- sample-repository`
Expected: FAIL

- [ ] **Step 7: Implement `src/storage/repositories/sample-repository.ts`**

```ts
import type { Database } from '../database';
import type { Sample } from '@/shared/types';

export class SampleRepository {
  constructor(private readonly db: Database) {}

  async insertMany(samples: Sample[]): Promise<void> {
    if (samples.length === 0) return;
    await this.db.transaction(async () => {
      for (const s of samples) {
        await this.db.execute(
          `INSERT INTO samples (run_id, t_ms, speed_mps, accel_long_ms2, accel_vert_ms2, lat, lon, hdop)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.run_id, s.t_ms, s.speed_mps, s.accel_long_ms2, s.accel_vert_ms2, s.lat, s.lon, s.hdop],
        );
      }
    });
  }

  async listByRun(runId: string): Promise<Sample[]> {
    return this.db.query<Sample>(
      'SELECT run_id, t_ms, speed_mps, accel_long_ms2, accel_vert_ms2, lat, lon, hdop FROM samples WHERE run_id = ? ORDER BY t_ms',
      [runId],
    );
  }

  async deleteByRun(runId: string): Promise<void> {
    await this.db.execute('DELETE FROM samples WHERE run_id = ?', [runId]);
  }
}
```

- [ ] **Step 8: Run test, expect pass**

Run: `npm test -- sample-repository`
Expected: 1 passed

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(storage): RunRepository and SampleRepository"
```

### Task 11: DerivedCurveRepository

**Files:**
- Create: `src/storage/repositories/derived-curve-repository.ts`
- Test: `tests/storage/derived-curve-repository.test.ts`

- [ ] **Step 1: Write failing test**

`tests/storage/derived-curve-repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import type { Database } from '@/storage/database';

describe('DerivedCurveRepository', () => {
  let db: Database;
  let runId: string;
  let curves: DerivedCurveRepository;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
    const v = await new VehicleRepository(db).create({ name: 'Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd', frontal_area_m2: null, drag_coefficient: null, notes: '' });
    const c = await new CalibrationRepository(db).create({ vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    const r = await new RunRepository(db).create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '' });
    runId = r.id;
    curves = new DerivedCurveRepository(db);
  });

  it('upserts a curve and reads it back', async () => {
    await curves.upsert({
      run_id: runId,
      rpm_min: 2000,
      rpm_max: 6000,
      points: [
        { rpm: 2000, wheel_power_kw: 40, wheel_torque_nm: 190 },
        { rpm: 4000, wheel_power_kw: 80, wheel_torque_nm: 191 },
      ],
      pipeline_version: 1,
      computed_at: '2026-05-24T00:00:00Z',
    });
    const got = await curves.getByRun(runId);
    expect(got?.points).toHaveLength(2);
    expect(got?.pipeline_version).toBe(1);
  });

  it('overwrites on second upsert', async () => {
    await curves.upsert({ run_id: runId, rpm_min: 0, rpm_max: 1, points: [], pipeline_version: 1, computed_at: '2026-05-24T00:00:00Z' });
    await curves.upsert({ run_id: runId, rpm_min: 0, rpm_max: 2, points: [{ rpm: 1, wheel_power_kw: 1, wheel_torque_nm: 1 }], pipeline_version: 2, computed_at: '2026-05-24T00:01:00Z' });
    const got = await curves.getByRun(runId);
    expect(got?.pipeline_version).toBe(2);
    expect(got?.rpm_max).toBe(2);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- derived-curve-repository`
Expected: FAIL

- [ ] **Step 3: Implement `src/storage/repositories/derived-curve-repository.ts`**

```ts
import type { Database } from '../database';
import type { DerivedCurve, RpmPoint } from '@/shared/types';

interface DerivedCurveRow extends Omit<DerivedCurve, 'points'> {
  points: string;
}

export class DerivedCurveRepository {
  constructor(private readonly db: Database) {}

  async upsert(curve: DerivedCurve): Promise<void> {
    await this.db.execute(
      `INSERT INTO derived_curves (run_id, rpm_min, rpm_max, points, pipeline_version, computed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         rpm_min = excluded.rpm_min,
         rpm_max = excluded.rpm_max,
         points = excluded.points,
         pipeline_version = excluded.pipeline_version,
         computed_at = excluded.computed_at`,
      [curve.run_id, curve.rpm_min, curve.rpm_max, JSON.stringify(curve.points), curve.pipeline_version, curve.computed_at],
    );
  }

  async getByRun(runId: string): Promise<DerivedCurve | null> {
    const rows = await this.db.query<DerivedCurveRow>(
      'SELECT * FROM derived_curves WHERE run_id = ?',
      [runId],
    );
    if (!rows[0]) return null;
    return { ...rows[0], points: JSON.parse(rows[0].points) as RpmPoint[] };
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- derived-curve-repository`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(storage): DerivedCurveRepository"
```

---

## Phase D — Sensor abstraction

### Task 12: Sensor types

**Files:**
- Create: `src/sensors/types.ts`

- [ ] **Step 1: Implement types**

```ts
import type { Observable } from '@/shared/observable';

export type Capability = 'speed' | 'rpm' | 'accel' | 'throttle';

export interface SensorSample<T> {
  t_ms: number;
  value: T;
  quality: number;
}

export interface SpeedValue { speed_mps: number; }
export interface RpmValue { rpm: number; }
export interface AccelValue { ax: number; ay: number; az: number; }

export interface SensorSource<T> {
  readonly id: string;
  readonly capabilities: Capability[];
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly samples$: Observable<SensorSample<T>>;
}

export type SpeedSource = SensorSource<SpeedValue>;
export type RpmSource = SensorSource<RpmValue>;
export type AccelSource = SensorSource<AccelValue>;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(sensors): types"
```

### Task 13: MockSpeedSource (fixture replay)

**Files:**
- Create: `src/sensors/mock-speed-source.ts`
- Test: `tests/sensors/mock-speed-source.test.ts`
- Create: `tests/fixtures/sample-run-3rd-gear.json`

- [ ] **Step 1: Create a small fixture for tests**

`tests/fixtures/sample-run-3rd-gear.json`: a synthetic acceleration in 3rd gear from 30 → 100 km/h over 10 seconds, sampled at 10 Hz, with rollout matching `(80 km/h, 3000 RPM)` calibration.

```json
{
  "calibration": { "rpm": 3000, "speed_kmh": 80 },
  "vehicle_mass_kg": 1300,
  "samples": [
    { "t_ms": 0, "speed_mps": 8.333, "quality": 1 },
    { "t_ms": 100, "speed_mps": 8.5, "quality": 1 },
    { "t_ms": 200, "speed_mps": 8.7, "quality": 1 },
    { "t_ms": 300, "speed_mps": 8.95, "quality": 1 },
    { "t_ms": 400, "speed_mps": 9.25, "quality": 1 }
  ]
}
```

Note: the full fixture is a longer array; for the test we only need a handful of samples. A longer fixture is generated programmatically in the e2e test (Task 25).

- [ ] **Step 2: Write failing test**

`tests/sensors/mock-speed-source.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import type { SensorSample, SpeedValue } from '@/sensors/types';

describe('MockSpeedSource', () => {
  it('emits scripted samples in order', async () => {
    vi.useFakeTimers();
    const src = new MockSpeedSource('mock', [
      { t_ms: 0, value: { speed_mps: 10 }, quality: 1 },
      { t_ms: 100, value: { speed_mps: 11 }, quality: 1 },
      { t_ms: 200, value: { speed_mps: 12 }, quality: 1 },
    ]);
    const received: SensorSample<SpeedValue>[] = [];
    src.samples$.subscribe((s) => received.push(s));
    await src.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(received.map((s) => s.value.speed_mps)).toEqual([10, 11, 12]);
    await src.stop();
    vi.useRealTimers();
  });

  it('respects stop() and does not emit afterwards', async () => {
    vi.useFakeTimers();
    const src = new MockSpeedSource('mock', [
      { t_ms: 0, value: { speed_mps: 10 }, quality: 1 },
      { t_ms: 200, value: { speed_mps: 11 }, quality: 1 },
    ]);
    const received: number[] = [];
    src.samples$.subscribe((s) => received.push(s.value.speed_mps));
    await src.start();
    await vi.advanceTimersByTimeAsync(50);
    await src.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(received).toEqual([10]);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run, see failure**

Run: `npm test -- mock-speed-source`
Expected: FAIL

- [ ] **Step 4: Implement `src/sensors/mock-speed-source.ts`**

```ts
import type { SensorSample, SpeedSource, SpeedValue, Capability } from './types';
import { Subject } from '@/shared/observable';

export class MockSpeedSource implements SpeedSource {
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;

  constructor(
    readonly id: string,
    private readonly script: SensorSample<SpeedValue>[],
  ) {}

  async start(): Promise<void> {
    this.running = true;
    for (const sample of this.script) {
      const t = setTimeout(() => {
        if (this.running) this.samples$.next(sample);
      }, sample.t_ms);
      this.timers.push(t);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
```

- [ ] **Step 5: Run test, expect pass**

Run: `npm test -- mock-speed-source`
Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(sensors): MockSpeedSource for fixture replay"
```

### Task 14: DerivedRpmSource

**Files:**
- Create: `src/sensors/derived-rpm-source.ts`
- Test: `tests/sensors/derived-rpm-source.test.ts`

- [ ] **Step 1: Write failing test**

`tests/sensors/derived-rpm-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MockSpeedSource } from '@/sensors/mock-speed-source';
import { DerivedRpmSource } from '@/sensors/derived-rpm-source';
import type { SensorSample, RpmValue } from '@/sensors/types';

describe('DerivedRpmSource', () => {
  it('emits rpm = speed_mps / rollout * 60', async () => {
    // calibration: 3000 rpm @ 80 km/h => rollout = (80/3.6) / 50 = 0.4444 m/rev
    const rollout = 80 / 3.6 / 50;
    const speedSrc = new MockSpeedSource('mock-speed', [
      { t_ms: 0, value: { speed_mps: 0 }, quality: 1 },
      { t_ms: 50, value: { speed_mps: 80 / 3.6 }, quality: 1 }, // should give 3000 rpm
      { t_ms: 100, value: { speed_mps: 100 / 3.6 }, quality: 1 }, // 3750 rpm
    ]);
    const rpmSrc = new DerivedRpmSource('derived-rpm', speedSrc, rollout);
    const received: SensorSample<RpmValue>[] = [];
    rpmSrc.samples$.subscribe((s) => received.push(s));
    await rpmSrc.start();
    await speedSrc.start();
    await new Promise((r) => setTimeout(r, 200));
    expect(received).toHaveLength(3);
    expect(received[0].value.rpm).toBe(0);
    expect(received[1].value.rpm).toBeCloseTo(3000, 1);
    expect(received[2].value.rpm).toBeCloseTo(3750, 1);
    await speedSrc.stop();
    await rpmSrc.stop();
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- derived-rpm-source`
Expected: FAIL

- [ ] **Step 3: Implement `src/sensors/derived-rpm-source.ts`**

```ts
import type { RpmSource, SensorSample, SpeedSource, RpmValue, Capability } from './types';
import { Subject, type Unsubscribe } from '@/shared/observable';

export class DerivedRpmSource implements RpmSource {
  readonly capabilities: Capability[] = ['rpm'];
  readonly samples$ = new Subject<SensorSample<RpmValue>>();
  private unsubscribe: Unsubscribe | null = null;

  constructor(
    readonly id: string,
    private readonly speedSource: SpeedSource,
    private readonly rolloutMPerRev: number,
  ) {}

  async start(): Promise<void> {
    this.unsubscribe = this.speedSource.samples$.subscribe((s) => {
      const revPerSec = s.value.speed_mps / this.rolloutMPerRev;
      const rpm = revPerSec * 60;
      this.samples$.next({ t_ms: s.t_ms, value: { rpm }, quality: s.quality });
    });
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- derived-rpm-source`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(sensors): DerivedRpmSource"
```

### Task 15: SensorRegistry stub

**Files:**
- Create: `src/sensors/sensor-registry.ts`

- [ ] **Step 1: Implement minimal registry**

```ts
import type { Capability, SensorSource } from './types';

type AnySource = SensorSource<unknown>;

export class SensorRegistry {
  private readonly sources: AnySource[] = [];

  register(source: AnySource): void {
    this.sources.push(source);
  }

  best<T extends AnySource>(capability: Capability): T | null {
    // Preference: OBD > Mock > GPS/Motion > Derived.
    // For Plan 1 only Mock and Derived exist; pick the first match in registration order.
    return (this.sources.find((s) => s.capabilities.includes(capability)) as T | undefined) ?? null;
  }
}
```

(Real preference logic ships in Plan 3 when OBD arrives. Plan 1 just needs lookup.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(sensors): SensorRegistry stub"
```

### Task 16: GpsSpeedSource (stub for Plan 1)

**Files:**
- Create: `src/sensors/gps-speed-source.ts`

The real Capacitor-wrapped GPS source is implemented in Plan 2. For Plan 1 we ship a stub that throws if used in a non-browser context, so the analysis code can reference the type without depending on Capacitor.

- [ ] **Step 1: Implement stub**

```ts
import type { Capability, SensorSample, SpeedSource, SpeedValue } from './types';
import { Subject, type Unsubscribe } from '@/shared/observable';

export class GpsSpeedSource implements SpeedSource {
  readonly id = 'gps';
  readonly capabilities: Capability[] = ['speed'];
  readonly samples$ = new Subject<SensorSample<SpeedValue>>();
  private watchId: number | null = null;
  private startMs = 0;
  private _: Unsubscribe | null = null;

  async start(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocation API not available in this environment');
    }
    this.startMs = performance.now();
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const speed = pos.coords.speed ?? 0;
        const t_ms = performance.now() - this.startMs;
        const quality = pos.coords.accuracy ? Math.max(0, 1 - pos.coords.accuracy / 30) : 0.5;
        this.samples$.next({ t_ms, value: { speed_mps: Math.max(0, speed) }, quality });
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }

  async stop(): Promise<void> {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(sensors): GpsSpeedSource (browser geolocation)"
```

---

## Phase E — Analysis pipeline

### Task 17: Analysis types

**Files:**
- Create: `src/analysis/types.ts`

- [ ] **Step 1: Implement**

```ts
import type { RpmPoint } from '@/shared/types';

export interface RawSpeedSample {
  t_ms: number;
  speed_mps: number;
}

export interface ResampledSample {
  t_ms: number;
  speed_mps: number;
}

export interface SmoothedSample {
  t_ms: number;
  speed_mps: number;
}

export interface DifferentiatedSample {
  t_ms: number;
  speed_mps: number;
  accel_ms2: number;
}

export interface AnalyzedRun {
  rpm_min: number;
  rpm_max: number;
  points: RpmPoint[];
  pipeline_version: number;
}

export const PIPELINE_VERSION = 1;
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(analysis): types and pipeline version"
```

### Task 18: Resample

**Files:**
- Create: `src/analysis/resample.ts`
- Test: `tests/analysis/resample.test.ts`

- [ ] **Step 1: Write failing test**

`tests/analysis/resample.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resample } from '@/analysis/resample';

describe('resample', () => {
  it('linearly interpolates onto fixed timebase', () => {
    const input = [
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 200, speed_mps: 2 },
      { t_ms: 400, speed_mps: 4 },
    ];
    const out = resample(input, 100);
    expect(out).toEqual([
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 100, speed_mps: 1 },
      { t_ms: 200, speed_mps: 2 },
      { t_ms: 300, speed_mps: 3 },
      { t_ms: 400, speed_mps: 4 },
    ]);
  });

  it('handles a single sample', () => {
    const out = resample([{ t_ms: 0, speed_mps: 5 }], 100);
    expect(out).toEqual([{ t_ms: 0, speed_mps: 5 }]);
  });

  it('returns empty for empty input', () => {
    expect(resample([], 100)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- resample`
Expected: FAIL

- [ ] **Step 3: Implement `src/analysis/resample.ts`**

```ts
import type { RawSpeedSample, ResampledSample } from './types';

export function resample(input: RawSpeedSample[], step_ms: number): ResampledSample[] {
  if (input.length === 0) return [];
  if (input.length === 1) return [{ t_ms: input[0].t_ms, speed_mps: input[0].speed_mps }];

  const sorted = [...input].sort((a, b) => a.t_ms - b.t_ms);
  const t0 = sorted[0].t_ms;
  const tn = sorted[sorted.length - 1].t_ms;
  const out: ResampledSample[] = [];

  let j = 0;
  for (let t = t0; t <= tn + 1e-6; t += step_ms) {
    while (j < sorted.length - 1 && sorted[j + 1].t_ms < t) j++;
    const a = sorted[j];
    const b = sorted[Math.min(j + 1, sorted.length - 1)];
    if (a.t_ms === b.t_ms) {
      out.push({ t_ms: t, speed_mps: a.speed_mps });
    } else {
      const f = (t - a.t_ms) / (b.t_ms - a.t_ms);
      out.push({ t_ms: t, speed_mps: a.speed_mps + f * (b.speed_mps - a.speed_mps) });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- resample`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analysis): resample to fixed timebase"
```

### Task 19: Savitzky-Golay smoother

**Files:**
- Create: `src/analysis/smooth.ts`
- Test: `tests/analysis/smooth.test.ts`

- [ ] **Step 1: Write failing test**

`tests/analysis/smooth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { smoothSavitzkyGolay } from '@/analysis/smooth';

describe('smoothSavitzkyGolay', () => {
  it('passes a straight line through unchanged', () => {
    const input = Array.from({ length: 20 }, (_, i) => ({ t_ms: i * 100, speed_mps: i }));
    const out = smoothSavitzkyGolay(input, 5);
    for (let i = 0; i < out.length; i++) {
      expect(out[i].speed_mps).toBeCloseTo(i, 6);
    }
  });

  it('attenuates a single-sample spike', () => {
    const input = Array.from({ length: 11 }, (_, i) => ({ t_ms: i * 100, speed_mps: i === 5 ? 10 : 0 }));
    const out = smoothSavitzkyGolay(input, 5);
    expect(out[5].speed_mps).toBeLessThan(10);
    expect(out[5].speed_mps).toBeGreaterThan(0);
  });

  it('returns input unchanged if window is too large for series', () => {
    const input = [
      { t_ms: 0, speed_mps: 1 },
      { t_ms: 100, speed_mps: 2 },
    ];
    expect(smoothSavitzkyGolay(input, 5)).toEqual(input);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- smooth`
Expected: FAIL

- [ ] **Step 3: Implement `src/analysis/smooth.ts`**

A quadratic Savitzky-Golay filter. For a symmetric window of half-width `m` (so window size = `2m+1`), the quadratic SG coefficients are `c_i = (3 * (3 * m * (m + 1) - 1 - 5 * i * i)) / ((2 * m + 3) * (2 * m + 1) * (2 * m - 1))`. We apply only to interior points; edges are passed through.

```ts
import type { ResampledSample, SmoothedSample } from './types';

export function smoothSavitzkyGolay(input: ResampledSample[], windowSize: number): SmoothedSample[] {
  if (windowSize % 2 === 0 || windowSize < 3) {
    throw new Error('windowSize must be odd and >= 3');
  }
  if (input.length < windowSize) return input.map((s) => ({ ...s }));
  const m = (windowSize - 1) / 2;
  const denom = (2 * m + 3) * (2 * m + 1) * (2 * m - 1);
  const coeffs: number[] = [];
  for (let i = -m; i <= m; i++) {
    coeffs.push((3 * (3 * m * (m + 1) - 1 - 5 * i * i)) / denom);
  }
  const out: SmoothedSample[] = input.map((s) => ({ ...s }));
  for (let k = m; k < input.length - m; k++) {
    let sum = 0;
    for (let i = -m; i <= m; i++) sum += coeffs[i + m] * input[k + i].speed_mps;
    out[k].speed_mps = sum;
  }
  return out;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- smooth`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analysis): Savitzky-Golay smoother (quadratic)"
```

### Task 20: Central-differences differentiator

**Files:**
- Create: `src/analysis/differentiate.ts`
- Test: `tests/analysis/differentiate.test.ts`

- [ ] **Step 1: Write failing test**

`tests/analysis/differentiate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { differentiate } from '@/analysis/differentiate';

describe('differentiate', () => {
  it('returns constant acceleration for linear speed', () => {
    // 10 m/s -> 20 m/s over 10 seconds = 1 m/s^2
    const input = Array.from({ length: 11 }, (_, i) => ({
      t_ms: i * 1000,
      speed_mps: 10 + i,
    }));
    const out = differentiate(input);
    // interior points should have accel ~1
    for (let i = 1; i < out.length - 1; i++) {
      expect(out[i].accel_ms2).toBeCloseTo(1, 6);
    }
  });

  it('uses forward/backward at edges', () => {
    const input = [
      { t_ms: 0, speed_mps: 0 },
      { t_ms: 1000, speed_mps: 1 },
      { t_ms: 2000, speed_mps: 4 },
    ];
    const out = differentiate(input);
    expect(out[0].accel_ms2).toBeCloseTo(1, 6); // forward
    expect(out[2].accel_ms2).toBeCloseTo(3, 6); // backward
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- differentiate`
Expected: FAIL

- [ ] **Step 3: Implement `src/analysis/differentiate.ts`**

```ts
import type { SmoothedSample, DifferentiatedSample } from './types';

export function differentiate(input: SmoothedSample[]): DifferentiatedSample[] {
  const n = input.length;
  if (n === 0) return [];
  const out: DifferentiatedSample[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let accel: number;
    if (i === 0) {
      accel = (input[1].speed_mps - input[0].speed_mps) / ((input[1].t_ms - input[0].t_ms) / 1000);
    } else if (i === n - 1) {
      accel = (input[n - 1].speed_mps - input[n - 2].speed_mps) / ((input[n - 1].t_ms - input[n - 2].t_ms) / 1000);
    } else {
      accel = (input[i + 1].speed_mps - input[i - 1].speed_mps) / ((input[i + 1].t_ms - input[i - 1].t_ms) / 1000);
    }
    out[i] = { t_ms: input[i].t_ms, speed_mps: input[i].speed_mps, accel_ms2: accel };
  }
  return out;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- differentiate`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analysis): central-difference differentiator"
```

### Task 21: RPM from speed

**Files:**
- Create: `src/analysis/rpm-from-speed.ts`
- Test: `tests/analysis/rpm-from-speed.test.ts`

- [ ] **Step 1: Write failing test**

`tests/analysis/rpm-from-speed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { speedToRpm } from '@/analysis/rpm-from-speed';

describe('speedToRpm', () => {
  it('computes rpm from speed and rollout', () => {
    // rollout 0.5 m/rev, speed 10 m/s => 20 rev/s => 1200 rpm
    expect(speedToRpm(10, 0.5)).toBeCloseTo(1200);
  });

  it('returns 0 for zero speed', () => {
    expect(speedToRpm(0, 0.5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- rpm-from-speed`
Expected: FAIL

- [ ] **Step 3: Implement `src/analysis/rpm-from-speed.ts`**

```ts
export function speedToRpm(speed_mps: number, rollout_m_per_rev: number): number {
  if (rollout_m_per_rev <= 0) throw new Error('rollout must be positive');
  return (speed_mps / rollout_m_per_rev) * 60;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- rpm-from-speed`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analysis): speedToRpm"
```

### Task 22: Power and torque

**Files:**
- Create: `src/analysis/power-torque.ts`
- Test: `tests/analysis/power-torque.test.ts`

- [ ] **Step 1: Write failing test**

`tests/analysis/power-torque.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { powerAndTorque } from '@/analysis/power-torque';

describe('powerAndTorque', () => {
  it('computes power = F*v and torque = P/omega', () => {
    // m = 1000 kg, a = 2 m/s^2, v = 10 m/s, rollout 0.5 m/rev
    // F = 2000 N, P = 20000 W = 20 kW
    // rpm = (10 / 0.5) * 60 = 1200, omega = 2*pi*20 = 125.66 rad/s
    // torque = 20000 / 125.66 = 159.15 Nm
    const out = powerAndTorque(
      [{ t_ms: 0, speed_mps: 10, accel_ms2: 2 }],
      1000,
      0.5,
    );
    expect(out[0].rpm).toBeCloseTo(1200, 2);
    expect(out[0].wheel_power_kw).toBeCloseTo(20, 3);
    expect(out[0].wheel_torque_nm).toBeCloseTo(159.15, 1);
  });

  it('drops samples with non-positive speed (torque undefined at 0 rpm)', () => {
    const out = powerAndTorque(
      [
        { t_ms: 0, speed_mps: 0, accel_ms2: 1 },
        { t_ms: 100, speed_mps: 1, accel_ms2: 1 },
      ],
      1000,
      0.5,
    );
    expect(out).toHaveLength(1);
    expect(out[0].t_ms).toBe(100);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- power-torque`
Expected: FAIL

- [ ] **Step 3: Implement `src/analysis/power-torque.ts`**

```ts
import type { DifferentiatedSample } from './types';
import { speedToRpm } from './rpm-from-speed';
import { rpmToRadPerSec } from '@/shared/units';

export interface PowerTorquePoint {
  t_ms: number;
  rpm: number;
  wheel_power_kw: number;
  wheel_torque_nm: number;
}

export function powerAndTorque(
  input: DifferentiatedSample[],
  mass_kg: number,
  rollout_m_per_rev: number,
): PowerTorquePoint[] {
  const out: PowerTorquePoint[] = [];
  for (const s of input) {
    if (s.speed_mps <= 0) continue;
    const force_n = mass_kg * s.accel_ms2;
    const power_w = force_n * s.speed_mps;
    const rpm = speedToRpm(s.speed_mps, rollout_m_per_rev);
    const omega = rpmToRadPerSec(rpm);
    const torque_nm = omega > 0 ? power_w / omega : 0;
    out.push({
      t_ms: s.t_ms,
      rpm,
      wheel_power_kw: power_w / 1000,
      wheel_torque_nm: torque_nm,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- power-torque`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analysis): wheel power & torque from F=ma"
```

### Task 23: RPM-bin aggregator

**Files:**
- Create: `src/analysis/rpm-bin.ts`
- Test: `tests/analysis/rpm-bin.test.ts`

- [ ] **Step 1: Write failing test**

`tests/analysis/rpm-bin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { binByRpm } from '@/analysis/rpm-bin';

describe('binByRpm', () => {
  it('averages points falling in the same bin', () => {
    const points = [
      { t_ms: 0, rpm: 2050, wheel_power_kw: 10, wheel_torque_nm: 50 },
      { t_ms: 100, rpm: 2080, wheel_power_kw: 20, wheel_torque_nm: 60 },
      { t_ms: 200, rpm: 2200, wheel_power_kw: 30, wheel_torque_nm: 70 },
    ];
    const out = binByRpm(points, 100);
    expect(out).toEqual([
      { rpm: 2050, wheel_power_kw: 15, wheel_torque_nm: 55 },
      { rpm: 2250, wheel_power_kw: 30, wheel_torque_nm: 70 },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(binByRpm([], 100)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- rpm-bin`
Expected: FAIL

- [ ] **Step 3: Implement `src/analysis/rpm-bin.ts`**

```ts
import type { PowerTorquePoint } from './power-torque';
import type { RpmPoint } from '@/shared/types';

export function binByRpm(input: PowerTorquePoint[], bin_width_rpm: number): RpmPoint[] {
  if (input.length === 0) return [];
  const buckets = new Map<number, { p: number[]; t: number[] }>();
  for (const pt of input) {
    const bucket = Math.floor(pt.rpm / bin_width_rpm);
    let arr = buckets.get(bucket);
    if (!arr) {
      arr = { p: [], t: [] };
      buckets.set(bucket, arr);
    }
    arr.p.push(pt.wheel_power_kw);
    arr.t.push(pt.wheel_torque_nm);
  }
  const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([bucket, arr]) => ({
    rpm: bucket * bin_width_rpm + bin_width_rpm / 2,
    wheel_power_kw: avg(arr.p),
    wheel_torque_nm: avg(arr.t),
  }));
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- rpm-bin`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analysis): RPM-bin averaging"
```

### Task 24: `analyzeRun()` orchestrator

**Files:**
- Create: `src/analysis/pipeline.ts`
- Test: `tests/analysis/pipeline.test.ts`

- [ ] **Step 1: Write failing test**

`tests/analysis/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { analyzeRun } from '@/analysis/pipeline';

describe('analyzeRun', () => {
  it('produces a non-empty curve for a synthetic constant-acceleration run', () => {
    // 1 m/s^2 from 10 to 30 m/s over 20s, mass 1000 kg, rollout 0.5 m/rev
    const samples = Array.from({ length: 201 }, (_, i) => ({
      t_ms: i * 100,
      speed_mps: 10 + i * 0.1,
    }));
    const result = analyzeRun({
      samples,
      mass_kg: 1000,
      rollout_m_per_rev: 0.5,
    });
    expect(result.points.length).toBeGreaterThan(0);
    // Constant 1 m/s^2 at increasing v -> P increases monotonically with rpm
    for (let i = 1; i < result.points.length; i++) {
      expect(result.points[i].wheel_power_kw).toBeGreaterThanOrEqual(
        result.points[i - 1].wheel_power_kw - 0.5, // small tolerance for binning noise
      );
    }
    expect(result.pipeline_version).toBe(1);
  });
});
```

- [ ] **Step 2: Run, see failure**

Run: `npm test -- pipeline`
Expected: FAIL

- [ ] **Step 3: Implement `src/analysis/pipeline.ts`**

```ts
import type { AnalyzedRun, RawSpeedSample } from './types';
import { PIPELINE_VERSION } from './types';
import { resample } from './resample';
import { smoothSavitzkyGolay } from './smooth';
import { differentiate } from './differentiate';
import { powerAndTorque } from './power-torque';
import { binByRpm } from './rpm-bin';

export interface AnalyzeInput {
  samples: RawSpeedSample[];
  mass_kg: number;
  rollout_m_per_rev: number;
  resample_step_ms?: number;
  smooth_window?: number;
  bin_width_rpm?: number;
}

export function analyzeRun(input: AnalyzeInput): AnalyzedRun {
  const step = input.resample_step_ms ?? 100;
  const window = input.smooth_window ?? 11;
  const bin = input.bin_width_rpm ?? 100;

  const resampled = resample(input.samples, step);
  const smoothed = smoothSavitzkyGolay(resampled, window);
  const differentiated = differentiate(smoothed);
  const ptPoints = powerAndTorque(differentiated, input.mass_kg, input.rollout_m_per_rev);
  const points = binByRpm(ptPoints, bin);

  const rpms = points.map((p) => p.rpm);
  return {
    rpm_min: rpms.length ? Math.min(...rpms) : 0,
    rpm_max: rpms.length ? Math.max(...rpms) : 0,
    points,
    pipeline_version: PIPELINE_VERSION,
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- pipeline`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(analysis): analyzeRun() pipeline orchestrator"
```

### Task 25: End-to-end fixture-to-curve test

**Files:**
- Create: `tests/e2e/fixture-to-curve.test.ts`
- Modify: `tests/fixtures/sample-run-3rd-gear.json` (extend to a full 10s run, generated programmatically here for clarity)

- [ ] **Step 1: Write the e2e test**

`tests/e2e/fixture-to-curve.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository, computeRollout } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
import { analyzeRun } from '@/analysis/pipeline';
import { nowIso } from '@/shared/iso-time';
import type { Database } from '@/storage/database';
import type { Sample } from '@/shared/types';

function generateRun(): { samples: { t_ms: number; speed_mps: number }[]; massKg: number; rolloutMPerRev: number } {
  // Synthetic: hold steady ~30 km/h, then ~constant 2 m/s^2 acceleration for ~8s.
  const samples: { t_ms: number; speed_mps: number }[] = [];
  let v = 30 / 3.6;
  let t = 0;
  for (; t <= 1000; t += 100) samples.push({ t_ms: t, speed_mps: v });
  for (; t <= 9000; t += 100) {
    v += 2 * 0.1;
    samples.push({ t_ms: t, speed_mps: v });
  }
  return { samples, massKg: 1300, rolloutMPerRev: computeRollout(3000, 80) };
}

describe('e2e: fixture → analysis → persisted derived curve', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createWebDatabase(':memory:');
    await runMigrations(db);
  });

  it('runs end-to-end and stores a non-trivial curve', async () => {
    const vehicles = new VehicleRepository(db);
    const cals = new CalibrationRepository(db);
    const runs = new RunRepository(db);
    const samplesRepo = new SampleRepository(db);
    const curves = new DerivedCurveRepository(db);

    const v = await vehicles.create({
      name: 'Test Civic', kind: 'car', mass_kg: 1300, drivetrain: 'fwd',
      frontal_area_m2: null, drag_coefficient: null, notes: '',
    });
    const c = await cals.create({ vehicle_id: v.id, gear_label: '3rd', rpm: 3000, speed_kmh: 80, notes: '' });
    const r = await runs.create({ vehicle_id: v.id, calibration_id: c.id, gear_label: '3rd', conditions: {}, notes: '' });

    const fixture = generateRun();
    const samples: Sample[] = fixture.samples.map((s) => ({
      run_id: r.id, t_ms: s.t_ms, speed_mps: s.speed_mps,
      accel_long_ms2: null, accel_vert_ms2: null, lat: null, lon: null, hdop: null,
    }));
    await samplesRepo.insertMany(samples);

    const result = analyzeRun({
      samples: fixture.samples,
      mass_kg: fixture.massKg,
      rollout_m_per_rev: fixture.rolloutMPerRev,
    });

    await curves.upsert({
      run_id: r.id,
      rpm_min: result.rpm_min,
      rpm_max: result.rpm_max,
      points: result.points,
      pipeline_version: result.pipeline_version,
      computed_at: nowIso(),
    });

    const stored = await curves.getByRun(r.id);
    expect(stored).not.toBeNull();
    expect(stored!.points.length).toBeGreaterThan(5);
    const peak = Math.max(...stored!.points.map((p) => p.wheel_power_kw));
    // Constant accel implies power grows with v; 1300 kg * 2 m/s^2 * ~25 m/s = ~65 kW peak.
    expect(peak).toBeGreaterThan(20);
    expect(peak).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run, expect pass**

Run: `npm test -- fixture-to-curve`
Expected: 1 passed

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(e2e): fixture → pipeline → persisted derived curve"
```

---

## Phase F — Minimal Garage UI

### Task 26: App shell with router and DB bootstrap

**Files:**
- Modify: `src/App.tsx`
- Create: `src/ui/app-shell.tsx`
- Create: `src/storage/db-context.tsx`

- [ ] **Step 1: Create `src/storage/db-context.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Database } from './database';
import { createDatabase } from './database-factory';
import { runMigrations } from './migrations/runner';

const DbContext = createContext<Database | null>(null);

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await createDatabase('dynorun.db');
      await runMigrations(d);
      if (!cancelled) setDb(d);
    })();
    return () => { cancelled = true; };
  }, []);
  if (!db) return <div>Loading database…</div>;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDatabase(): Database {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDatabase outside DbProvider');
  return db;
}
```

- [ ] **Step 2: Create `src/ui/app-shell.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <NavLink to="/">Garage</NavLink>
        <NavLink to="/replay">Replay demo</NavLink>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 3: Modify `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DbProvider } from './storage/db-context';
import { AppShell } from './ui/app-shell';
import { GarageScreen } from './ui/garage/garage-screen';
import { VehicleDetail } from './ui/garage/vehicle-detail';
import { FixtureReplayScreen } from './ui/fixture-replay/fixture-replay-screen';

export default function App() {
  return (
    <DbProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<GarageScreen />} />
            <Route path="/vehicles/:id" element={<VehicleDetail />} />
            <Route path="/replay" element={<FixtureReplayScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DbProvider>
  );
}
```

(`GarageScreen`, `VehicleDetail`, and `FixtureReplayScreen` are added in subsequent tasks. Until then this file will fail to typecheck — that's expected; the next tasks fix it.)

- [ ] **Step 4: Commit (no typecheck yet — next tasks add the missing screens)**

```bash
git add -A
git commit -m "feat(ui): app shell + router + DB provider"
```

### Task 27: GarageScreen + VehicleForm

**Files:**
- Create: `src/ui/garage/garage-screen.tsx`
- Create: `src/ui/garage/vehicle-form.tsx`
- Test: `tests/ui/garage-screen.test.tsx`

- [ ] **Step 1: Write a light integration test for the garage list**

`tests/ui/garage-screen.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { GarageScreen } from '@/ui/garage/garage-screen';

async function makeDb() {
  const db = await createWebDatabase(':memory:');
  await runMigrations(db);
  return db;
}

describe('GarageScreen', () => {
  it('shows empty state then lists added vehicle', async () => {
    const db = await makeDb();
    render(
      <DbContext.Provider value={db}>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<GarageScreen />} />
          </Routes>
        </MemoryRouter>
      </DbContext.Provider>,
    );

    expect(await screen.findByText(/no vehicles/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add vehicle/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Civic' } });
    fireEvent.change(screen.getByLabelText(/mass/i), { target: { value: '1300' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText('Civic')).toBeInTheDocument());
  });
});
```

(Note: this test imports `DbContext` directly. Export it from `db-context.tsx`.)

- [ ] **Step 2: Export `DbContext` from `db-context.tsx`**

Edit `src/storage/db-context.tsx`: change `const DbContext = createContext...` to `export const DbContext = createContext...`.

- [ ] **Step 3: Run test, see failure**

Run: `npm test -- garage-screen`
Expected: FAIL (modules not found)

- [ ] **Step 4: Implement `src/ui/garage/vehicle-form.tsx`**

```tsx
import { useState } from 'react';
import type { VehicleKind, Drivetrain } from '@/shared/types';
import type { NewVehicle } from '@/storage/repositories/vehicle-repository';

export function VehicleForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<NewVehicle>;
  onSubmit: (v: NewVehicle) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<VehicleKind>(initial?.kind ?? 'car');
  const [mass, setMass] = useState(String(initial?.mass_kg ?? ''));
  const [drivetrain, setDrivetrain] = useState<Drivetrain>(initial?.drivetrain ?? 'fwd');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const massKg = parseFloat(mass);
    if (!name.trim() || !isFinite(massKg) || massKg <= 0) return;
    onSubmit({
      name: name.trim(),
      kind,
      mass_kg: massKg,
      drivetrain,
      frontal_area_m2: null,
      drag_coefficient: null,
      notes,
    });
  }

  return (
    <form onSubmit={submit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as VehicleKind)}>
          <option value="car">Car</option>
          <option value="motorcycle">Motorcycle</option>
        </select>
      </label>
      <label>
        Mass (kg, total moving: vehicle + driver + fuel)
        <input value={mass} inputMode="decimal" onChange={(e) => setMass(e.target.value)} />
      </label>
      <label>
        Drivetrain
        <select value={drivetrain} onChange={(e) => setDrivetrain(e.target.value as Drivetrain)}>
          <option value="fwd">FWD</option>
          <option value="rwd">RWD</option>
          <option value="awd">AWD</option>
          <option value="chain">Chain</option>
          <option value="shaft">Shaft</option>
        </select>
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div>
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Implement `src/ui/garage/garage-screen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import type { Vehicle } from '@/shared/types';
import { VehicleForm } from './vehicle-form';

export function GarageScreen() {
  const db = useDatabase();
  const repo = new VehicleRepository(db);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [adding, setAdding] = useState(false);

  async function reload() {
    setVehicles(await repo.list());
  }

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (vehicles === null) return <p>Loading…</p>;

  return (
    <section>
      <h1>Garage</h1>
      {vehicles.length === 0 && !adding && <p>No vehicles yet.</p>}
      <ul>
        {vehicles.map((v) => (
          <li key={v.id}>
            <Link to={`/vehicles/${v.id}`}>{v.name}</Link> — {v.kind}, {v.mass_kg} kg
          </li>
        ))}
      </ul>
      {adding ? (
        <VehicleForm
          onSubmit={async (input) => {
            await repo.create(input);
            setAdding(false);
            await reload();
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button onClick={() => setAdding(true)}>Add vehicle</button>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run test, expect pass**

Run: `npm test -- garage-screen`
Expected: 1 passed

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): GarageScreen + VehicleForm"
```

### Task 28: VehicleDetail (read-only for Plan 1)

**Files:**
- Create: `src/ui/garage/vehicle-detail.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
import { RunRepository } from '@/storage/repositories/run-repository';
import type { Vehicle, Calibration, Run } from '@/shared/types';

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const db = useDatabase();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    if (!id) return;
    const vehicles = new VehicleRepository(db);
    const calRepo = new CalibrationRepository(db);
    const runRepo = new RunRepository(db);
    (async () => {
      setVehicle(await vehicles.get(id));
      setCals(await calRepo.listByVehicle(id));
      setRuns(await runRepo.listByVehicle(id));
    })();
  }, [id, db]);

  if (!vehicle) return <p>Loading…</p>;

  return (
    <section>
      <p><Link to="/">← Garage</Link></p>
      <h1>{vehicle.name}</h1>
      <p>{vehicle.kind}, {vehicle.mass_kg} kg, {vehicle.drivetrain}</p>
      <h2>Calibrations ({cals.length})</h2>
      <ul>{cals.map((c) => <li key={c.id}>{c.gear_label}: {c.rpm} RPM @ {c.speed_kmh} km/h (rollout {c.rollout_m_per_rev.toFixed(4)} m/rev)</li>)}</ul>
      <h2>Runs ({runs.length})</h2>
      <ul>{runs.map((r) => <li key={r.id}>{r.started_at} — {r.gear_label} — {r.status}</li>)}</ul>
      <p><em>Calibration wizard and live runs ship in Plan 2.</em></p>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): read-only VehicleDetail"
```

---

## Phase G — Fixture replay demo

### Task 29: Static `<PowerCurveChart>`

**Files:**
- Create: `src/ui/components/power-curve-chart.tsx`

- [ ] **Step 1: Implement uPlot wrapper for a static power curve**

```tsx
import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { RpmPoint } from '@/shared/types';

export function PowerCurveChart({ points, label = 'Power (kW)' }: { points: RpmPoint[]; label?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const xs = points.map((p) => p.rpm);
    const ys = points.map((p) => p.wheel_power_kw);
    const data: uPlot.AlignedData = [xs, ys];
    const opts: uPlot.Options = {
      width: ref.current.clientWidth,
      height: 320,
      scales: { x: { time: false } },
      axes: [{ label: 'RPM' }, { label }],
      series: [
        {},
        { label, stroke: '#1f77b4', width: 2 },
      ],
    };
    plotRef.current = new uPlot(opts, data, ref.current);
    return () => { plotRef.current?.destroy(); plotRef.current = null; };
  }, [points, label]);

  return <div ref={ref} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): static PowerCurveChart via uPlot"
```

### Task 30: FixtureReplayScreen

**Files:**
- Create: `src/ui/fixture-replay/fixture-replay-screen.tsx`

This screen lets a developer (and you, as PM, for sanity checking) load a JSON fixture and see the resulting power curve. It is the visible proof that Plan 1 is correct end-to-end.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { analyzeRun } from '@/analysis/pipeline';
import { computeRollout } from '@/storage/repositories/calibration-repository';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import type { AnalyzedRun } from '@/analysis/types';

interface Fixture {
  calibration: { rpm: number; speed_kmh: number };
  vehicle_mass_kg: number;
  samples: { t_ms: number; speed_mps: number }[];
}

export function FixtureReplayScreen() {
  const [result, setResult] = useState<AnalyzedRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const f = JSON.parse(text) as Fixture;
      const rollout = computeRollout(f.calibration.rpm, f.calibration.speed_kmh);
      const r = analyzeRun({
        samples: f.samples,
        mass_kg: f.vehicle_mass_kg,
        rollout_m_per_rev: rollout,
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <h1>Fixture replay</h1>
      <p>Upload a JSON fixture (calibration, mass, speed samples) to see the derived power curve.</p>
      <input type="file" accept="application/json" onChange={onFile} />
      {error && <pre style={{ color: 'crimson' }}>{error}</pre>}
      {result && (
        <>
          <h2>Power curve ({result.rpm_min.toFixed(0)} – {result.rpm_max.toFixed(0)} RPM)</h2>
          <PowerCurveChart points={result.points} />
          <p>{result.points.length} binned points · pipeline v{result.pipeline_version}</p>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck`
Expected: exits 0
Run: `npm run build`
Expected: exits 0

- [ ] **Step 3: Smoke-test in a browser**

Run: `npm run dev`
Open the printed URL in a browser. Confirm:
- Garage shows "No vehicles yet."
- Adding a vehicle works and it appears in the list.
- Clicking the vehicle opens its detail page.
- The Replay demo loads a fixture and renders a curve.

(Optional: write a fixture file by exporting the e2e test's `generateRun()` output to JSON via a small Node script. Not strictly required for Plan 1 completion.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): FixtureReplayScreen demo"
```

### Task 31: Run all checks

- [ ] **Step 1: Full typecheck**

Run: `npm run typecheck`
Expected: exits 0

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: exits 0

- [ ] **Step 4: Final commit if anything changed**

```bash
git status
# If clean, no commit needed.
```

---

## Done. What Plan 1 delivers

A working web app where:

- The full database schema is migrated on first run.
- You can create, edit, and view vehicles.
- The analysis pipeline (resample → smooth → differentiate → power/torque → bin) is unit-tested and end-to-end-tested against a synthetic run.
- The Replay demo screen takes a JSON fixture and renders the derived power curve in a real uPlot chart — the physics layer is visibly correct before any live-driving UX exists.
- Sensor abstraction interfaces are in place, with `MockSpeedSource`, `DerivedRpmSource`, and a stubbed `GpsSpeedSource`.

**What comes next (Plan 2):** Calibration wizard with live GPS stability detection; live run view with streaming uPlot chart; auto-stop detection; the run controller state machine; permissions and wake lock; run review screen with notes and save/discard.

**What comes after that (Plan 3):** Compare screen, settings/export, Capacitor iOS + Android packaging with native plugins, on-device smoke tests.
