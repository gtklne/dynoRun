# Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local sql.js storage layer with API calls to the Hono backend, and add magic link login via better-auth.

**Architecture:** Define TypeScript interfaces for each repository so controllers don't depend on concrete classes. Implement API versions of each repository using a thin `fetch` wrapper. Replace `DbProvider` with `AuthProvider` in `App.tsx`. Add a `/login` screen. Remove sql.js entirely.

**Tech Stack:** better-auth browser client, React Context, fetch API, Vite

**Dependency:** The backend API plan (`2026-05-24-backend-api.md`) must be deployed and running before this frontend can be tested end-to-end.

---

## File Structure

**New files:**
```
src/
├── auth/
│   ├── auth-client.ts            # better-auth browser client singleton
│   └── auth-context.tsx          # AuthProvider + useAuth() hook
├── api/
│   ├── client.ts                 # fetch wrapper (base URL, credentials, 401 redirect)
│   └── repositories/
│       ├── types.ts              # IVehicleRepo, IRunRepo, etc. interfaces
│       ├── vehicle-repository.ts
│       ├── calibration-repository.ts
│       ├── run-repository.ts
│       ├── sample-repository.ts
│       └── derived-curve-repository.ts
└── ui/auth/
    └── login-screen.tsx
```

**Modified files:**
```
src/App.tsx                          # Replace DbProvider → AuthProvider, add /login
src/run/run-controller.ts            # Parameter types: concrete class → interface
src/run/calibration-controller.ts    # Parameter types: concrete class → interface
```

**Deleted files:**
```
src/storage/                         # Entire directory removed
```

---

### Task 1: Define repository interfaces

**Files:**
- Create: `src/api/repositories/types.ts`

The run-controller and calibration-controller are typed against the concrete repository classes. Before swapping implementations, define interfaces that both the old and new repos satisfy, then update the controllers.

- [ ] **Step 1: Create src/api/repositories/types.ts**

```ts
import type {
  Vehicle, Calibration, Run, Sample, DerivedCurve,
  VehicleKind, Drivetrain,
} from '@/shared/types';

export interface NewVehicle {
  name: string;
  kind: VehicleKind;
  mass_kg: number;
  drivetrain: Drivetrain;
  frontal_area_m2: number | null;
  drag_coefficient: number | null;
  notes: string;
}

export interface NewCalibration {
  vehicle_id: string;
  gear_label: string;
  rpm: number;
  speed_kmh: number;
  notes: string;
}

export interface NewRun {
  vehicle_id: string;
  calibration_id: string;
  gear_label: string;
  conditions: object;
  notes: string;
}

export interface IVehicleRepository {
  create(input: NewVehicle): Promise<Vehicle>;
  get(id: string): Promise<Vehicle | null>;
  list(): Promise<Vehicle[]>;
  update(id: string, patch: Partial<NewVehicle>): Promise<Vehicle>;
  delete(id: string): Promise<void>;
}

export interface ICalibrationRepository {
  create(input: NewCalibration): Promise<Calibration>;
  get(id: string): Promise<Calibration | null>;
  listByVehicle(vehicleId: string): Promise<Calibration[]>;
  delete(id: string): Promise<void>;
}

export interface IRunRepository {
  create(input: NewRun): Promise<Run>;
  get(id: string): Promise<Run | null>;
  listByVehicle(vehicleId: string): Promise<Run[]>;
  markDegraded(id: string): Promise<void>;
  markAborted(id: string): Promise<void>;
  markComplete(id: string): Promise<void>;
  finalize(id: string, endedAt: string): Promise<void>;
  updateNotes(id: string, notes: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ISampleRepository {
  insertMany(samples: Sample[]): Promise<void>;
  listByRun(runId: string): Promise<Sample[]>;
  deleteByRun(runId: string): Promise<void>;
}

export interface IDerivedCurveRepository {
  upsert(curve: DerivedCurve): Promise<void>;
  getByRun(runId: string): Promise<DerivedCurve | null>;
}
```

- [ ] **Step 2: Verify TypeScript accepts this file**

```bash
cd /Users/jnothstein/Documents/websites/dynoRun && npm run typecheck
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/api/repositories/types.ts
git commit -m "feat(api): add repository interfaces"
```

---

### Task 2: Update controllers to use interfaces

**Files:**
- Modify: `src/run/run-controller.ts`
- Modify: `src/run/calibration-controller.ts`

Read both files first. Find their constructor parameter types. Replace `RunRepository`, `SampleRepository`, `DerivedCurveRepository`, `CalibrationRepository` with the interface equivalents.

- [ ] **Step 1: Read run-controller.ts**

```bash
cat /Users/jnothstein/Documents/websites/dynoRun/src/run/run-controller.ts
```

- [ ] **Step 2: Update run-controller.ts constructor imports and types**

Find the import lines and constructor in run-controller.ts. Replace the concrete class imports with the interfaces:

Before (will look something like):
```ts
import { RunRepository } from '@/storage/repositories/run-repository';
import { SampleRepository } from '@/storage/repositories/sample-repository';
import { DerivedCurveRepository } from '@/storage/repositories/derived-curve-repository';
```

After:
```ts
import type { IRunRepository, ISampleRepository, IDerivedCurveRepository } from '@/api/repositories/types';
```

And update the constructor parameter types:
```ts
constructor(
  private readonly runs: IRunRepository,
  private readonly samples: ISampleRepository,
  private readonly curves: IDerivedCurveRepository,
  // ... any other parameters stay as-is
)
```

- [ ] **Step 3: Read calibration-controller.ts**

```bash
cat /Users/jnothstein/Documents/websites/dynoRun/src/run/calibration-controller.ts
```

- [ ] **Step 4: Update calibration-controller.ts constructor imports and types**

Replace the concrete `CalibrationRepository` import with the interface:

Before:
```ts
import { CalibrationRepository } from '@/storage/repositories/calibration-repository';
```

After:
```ts
import type { ICalibrationRepository } from '@/api/repositories/types';
```

And update the constructor parameter type to `ICalibrationRepository`.

- [ ] **Step 5: Verify no TypeScript errors**

```bash
npm run typecheck
```

Expected: no new errors. (There will still be import errors in files that import from storage — those are fixed in later tasks.)

- [ ] **Step 6: Commit**

```bash
git add src/run/run-controller.ts src/run/calibration-controller.ts
git commit -m "refactor(run): use repository interfaces instead of concrete classes"
```

---

### Task 3: better-auth client + auth context

**Files:**
- Create: `src/auth/auth-client.ts`
- Create: `src/auth/auth-context.tsx`

- [ ] **Step 1: Install better-auth**

```bash
npm install better-auth
```

- [ ] **Step 2: Create src/auth/auth-client.ts**

```ts
import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  plugins: [magicLinkClient()],
});
```

- [ ] **Step 3: Create src/auth/auth-context.tsx**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authClient } from './auth-client';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient.getSession().then((res) => {
      setUser(res.data?.user ?? null);
      setLoading(false);
    });
  }, []);

  async function signOut() {
    await authClient.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth-client.ts src/auth/auth-context.tsx package.json package-lock.json
git commit -m "feat(auth): add better-auth client and auth context"
```

---

### Task 4: API fetch client

**Files:**
- Create: `src/api/client.ts`

- [ ] **Step 1: Create src/api/client.ts**

```ts
const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/client.ts
git commit -m "feat(api): add fetch client with auth redirect"
```

---

### Task 5: API vehicle repository

**Files:**
- Create: `src/api/repositories/vehicle-repository.ts`

- [ ] **Step 1: Create src/api/repositories/vehicle-repository.ts**

```ts
import { apiFetch } from '../client';
import type { Vehicle } from '@/shared/types';
import type { IVehicleRepository, NewVehicle } from './types';

export const vehicleRepository: IVehicleRepository = {
  list: () =>
    apiFetch<Vehicle[]>('/api/vehicles'),

  get: (id) =>
    apiFetch<Vehicle>(`/api/vehicles/${id}`).catch(() => null),

  create: (input) =>
    apiFetch<Vehicle>('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id, patch) =>
    apiFetch<Vehicle>(`/api/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  delete: (id) =>
    apiFetch<void>(`/api/vehicles/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/api/repositories/vehicle-repository.ts
git commit -m "feat(api): add vehicle repository"
```

---

### Task 6: API calibration repository

**Files:**
- Create: `src/api/repositories/calibration-repository.ts`

- [ ] **Step 1: Create src/api/repositories/calibration-repository.ts**

```ts
import { apiFetch } from '../client';
import type { Calibration } from '@/shared/types';
import type { ICalibrationRepository, NewCalibration } from './types';

export const calibrationRepository: ICalibrationRepository = {
  create: (input: NewCalibration) =>
    apiFetch<Calibration>(`/api/vehicles/${input.vehicle_id}/calibrations`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  get: (id) =>
    apiFetch<Calibration>(`/api/calibrations/${id}`).catch(() => null),

  listByVehicle: (vehicleId) =>
    apiFetch<Calibration[]>(`/api/vehicles/${vehicleId}/calibrations`),

  delete: (id) =>
    apiFetch<void>(`/api/calibrations/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/api/repositories/calibration-repository.ts
git commit -m "feat(api): add calibration repository"
```

---

### Task 7: API run repository

**Files:**
- Create: `src/api/repositories/run-repository.ts`

- [ ] **Step 1: Create src/api/repositories/run-repository.ts**

```ts
import { apiFetch } from '../client';
import type { Run } from '@/shared/types';
import type { IRunRepository, NewRun } from './types';

export const runRepository: IRunRepository = {
  create: (input: NewRun) =>
    apiFetch<Run>('/api/runs', { method: 'POST', body: JSON.stringify(input) }),

  get: (id) =>
    apiFetch<Run>(`/api/runs/${id}`).catch(() => null),

  listByVehicle: (vehicleId) =>
    apiFetch<Run[]>(`/api/vehicles/${vehicleId}/runs`),

  markDegraded: (id) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'degraded' }),
    }),

  markAborted: (id) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'aborted' }),
    }),

  markComplete: (id) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'complete' }),
    }),

  finalize: (id, endedAt) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ended_at: endedAt }),
    }),

  updateNotes: (id, notes) =>
    apiFetch<void>(`/api/runs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes }),
    }),

  delete: (id) =>
    apiFetch<void>(`/api/runs/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/api/repositories/run-repository.ts
git commit -m "feat(api): add run repository"
```

---

### Task 8: API sample + derived curve repositories

**Files:**
- Create: `src/api/repositories/sample-repository.ts`
- Create: `src/api/repositories/derived-curve-repository.ts`

- [ ] **Step 1: Create src/api/repositories/sample-repository.ts**

```ts
import { apiFetch } from '../client';
import type { Sample } from '@/shared/types';
import type { ISampleRepository } from './types';

export const sampleRepository: ISampleRepository = {
  insertMany: (samples: Sample[]) => {
    if (samples.length === 0) return Promise.resolve();
    return apiFetch<void>(`/api/runs/${samples[0].run_id}/samples`, {
      method: 'POST',
      body: JSON.stringify(samples),
    });
  },

  listByRun: (runId) =>
    apiFetch<Sample[]>(`/api/runs/${runId}/samples`),

  // Samples are deleted server-side when a run is deleted (cascaded in runs DELETE route)
  deleteByRun: (_runId) => Promise.resolve(),
};
```

- [ ] **Step 2: Create src/api/repositories/derived-curve-repository.ts**

```ts
import { apiFetch } from '../client';
import type { DerivedCurve } from '@/shared/types';
import type { IDerivedCurveRepository } from './types';

export const derivedCurveRepository: IDerivedCurveRepository = {
  upsert: (curve: DerivedCurve) =>
    apiFetch<void>(`/api/runs/${curve.run_id}/curve`, {
      method: 'PUT',
      body: JSON.stringify(curve),
    }),

  getByRun: (runId) =>
    apiFetch<DerivedCurve>(`/api/runs/${runId}/curve`).catch(() => null),
};
```

- [ ] **Step 3: Commit**

```bash
git add src/api/repositories/sample-repository.ts src/api/repositories/derived-curve-repository.ts
git commit -m "feat(api): add sample and derived curve repositories"
```

---

### Task 9: Login screen

**Files:**
- Create: `src/ui/auth/login-screen.tsx`

- [ ] **Step 1: Create src/ui/auth/login-screen.tsx**

```tsx
import { useState } from 'react';
import { authClient } from '@/auth/auth-client';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await authClient.signIn.magicLink({ email, callbackURL: '/' });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? 'Something went wrong');
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-gray-500">We sent a sign-in link to <strong>{email}</strong>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">DynoRun</h1>
        <p className="text-gray-500">Enter your email to sign in.</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border px-3 py-2"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send magic link'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/auth/login-screen.tsx
git commit -m "feat(ui): add login screen with magic link form"
```

---

### Task 10: Update App.tsx

**Files:**
- Modify: `src/App.tsx`

Replace `DbProvider` with `AuthProvider`, wire up all screens to use the API repositories (via props or context), add `RequireAuth` protection, and add `/login` route.

- [ ] **Step 1: Read all screens to understand how they use repositories**

```bash
grep -rn "useDatabase\|VehicleRepository\|RunRepository\|CalibrationRepository\|SampleRepository\|DerivedCurveRepository" /Users/jnothstein/Documents/websites/dynoRun/src/ui/ /Users/jnothstein/Documents/websites/dynoRun/src/run/
```

This tells you every file that needs updating.

- [ ] **Step 2: Replace each screen's DB usage with API repositories**

For each file found in Step 1, replace:
```ts
// OLD
import { useDatabase } from '@/storage/db-context';
import { VehicleRepository } from '@/storage/repositories/vehicle-repository';
// ...
const db = useDatabase();
const vehicleRepo = useMemo(() => new VehicleRepository(db), [db]);
```

With:
```ts
// NEW
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
// use vehicleRepository directly — no useMemo needed, it's a singleton object
```

Same pattern for all other repositories. Each `new XxxRepository(db)` becomes the singleton import from `@/api/repositories/`.

- [ ] **Step 3: Rewrite src/App.tsx**

```tsx
import { Navigate, BrowserRouter, Routes, Route } from 'react-router-dom';
import { type ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import { AppShell } from './ui/app-shell';
import { LoginScreen } from './ui/auth/login-screen';
import { GarageScreen } from './ui/garage/garage-screen';
import { VehicleDetail } from './ui/garage/vehicle-detail';
import { FixtureReplayScreen } from './ui/fixture-replay/fixture-replay-screen';
import { CalibrationWizardScreen } from './ui/calibration/calibration-wizard-screen';
import { LiveRunScreen } from './ui/run/live-run-screen';
import { RunReviewScreen } from './ui/run/run-review-screen';
import { CompareScreen } from './ui/compare/compare-screen';
import { SettingsScreen } from './ui/settings/settings-screen';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<GarageScreen />} />
            <Route path="/vehicles/:id" element={<VehicleDetail />} />
            <Route path="/vehicles/:vehicleId/calibrations/new" element={<CalibrationWizardScreen />} />
            <Route path="/vehicles/:vehicleId/calibrations/:calibrationId/run" element={<LiveRunScreen />} />
            <Route path="/runs/:runId/review" element={<RunReviewScreen />} />
            <Route path="/replay" element={<FixtureReplayScreen />} />
            <Route path="/vehicles/:vehicleId/compare" element={<CompareScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npm run typecheck
```

Fix any errors. Common issues: screens still importing from `@/storage/` (fix each one to use `@/api/repositories/`).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ui/
git commit -m "feat(app): wire auth provider and API repositories into all screens"
```

---

### Task 11: Remove sql.js and old storage

**Files:**
- Delete: `src/storage/` (entire directory)
- Modify: `package.json` (remove sql.js)
- Modify: `src/main.tsx` (remove any sql.js imports if present)

- [ ] **Step 1: Verify nothing imports from src/storage/ anymore**

```bash
grep -rn "from '@/storage" /Users/jnothstein/Documents/websites/dynoRun/src/
```

Expected: no results. If any remain, fix them now before deleting.

- [ ] **Step 2: Delete the storage directory**

```bash
rm -rf /Users/jnothstein/Documents/websites/dynoRun/src/storage
```

- [ ] **Step 3: Remove sql.js from package.json**

```bash
cd /Users/jnothstein/Documents/websites/dynoRun && npm uninstall sql.js @types/sql.js
```

- [ ] **Step 4: Run typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: clean build, no errors. If you get missing-module errors, trace them back and fix the remaining import.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass. (Tests are for the analysis pipeline — they don't touch storage, so they should be unaffected.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(frontend): remove sql.js and local storage layer"
```

---

### Task 12: Push and test end-to-end

- [ ] **Step 1: Push to trigger CI deploy**

```bash
git push
```

Wait for both GitHub Actions jobs (`deploy` and `deploy-api`) to go green.

- [ ] **Step 2: Open the app in a browser**

Go to `http://138.199.154.225/`. Expected: redirected to `/login`.

- [ ] **Step 3: Sign in with magic link**

Enter your email, receive the link, click it. Expected: redirected to `/` (garage screen).

- [ ] **Step 4: Create a vehicle and run**

Create a vehicle → add a calibration → start a run (use mock sensor). Save the run. Reload the page. Expected: vehicle and run still there — data now persists in PostgreSQL.

- [ ] **Step 5: Open on phone**

Navigate to `http://138.199.154.225/` on your phone. Sign in with your email. Expected: same data visible — shared across devices.
