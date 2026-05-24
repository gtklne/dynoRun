# Frontend Integration Design

## Goal

Replace the local sql.js database layer with API calls to the Hono backend. Add a login screen and auth session management. The rest of the app (run controller, analysis pipeline, charts) is unchanged.

## Dependency

This spec depends on `2026-05-24-backend-api-design.md` being deployed first.

---

## What changes, what stays the same

### Unchanged
- All business logic: `run/`, `analysis/`, `sensors/`, `shared/`
- All UI screens and components
- React Router routes (except adding `/login`)
- Repository *interfaces* — same method signatures

### Removed
- `src/storage/database.ts`, `database-web.ts`, `database-capacitor.ts`, `database-factory.ts`
- `src/storage/db-context.tsx`
- `src/storage/migrations/`
- `src/storage/repositories/` (replaced by API versions)
- `sql.js` and `@types/sql.js` dependencies

### Added
```
src/
├── auth/
│   ├── auth-client.ts        # better-auth browser client (createAuthClient)
│   └── auth-context.tsx      # AuthProvider, useAuth() hook, session state
│
├── api/
│   ├── client.ts             # fetch wrapper: base URL, credentials, error handling
│   └── repositories/
│       ├── vehicle-repository.ts
│       ├── calibration-repository.ts
│       ├── run-repository.ts
│       ├── sample-repository.ts
│       └── derived-curve-repository.ts
│
└── ui/
    └── auth/
        └── login-screen.tsx  # Email input → magic link sent state
```

---

## Auth integration

### better-auth browser client (`src/auth/auth-client.ts`)

```ts
import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "",
  plugins: [magicLinkClient()],
});
```

### Auth context (`src/auth/auth-context.tsx`)

Wraps the app. On mount, calls `authClient.getSession()` to check for an existing session. Provides:

```ts
interface AuthContext {
  user: { id: string; email: string } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
```

### Session storage

better-auth uses an HttpOnly cookie — the frontend never touches the token directly. `credentials: "include"` is set on all fetch calls so the browser sends the cookie automatically.

---

## API client (`src/api/client.ts`)

Thin wrapper around `fetch`:

```ts
const BASE = import.meta.env.VITE_API_URL ?? "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
```

No retry logic, no caching — keep it simple.

---

## API repositories

Each repository in `src/api/repositories/` implements the same method signatures as the existing `src/storage/repositories/` files. The run controller, calibration controller, and all screens inject repositories via React context — so swapping the implementation is the only change needed.

Example — `run-repository.ts`:

```ts
import { apiFetch } from "../client";
import type { Run } from "@/shared/types";

export const runRepository = {
  listForVehicle: (vehicleId: string) =>
    apiFetch<Run[]>(`/api/vehicles/${vehicleId}/runs`),

  create: (run: Omit<Run, "id" | "createdAt" | "updatedAt">) =>
    apiFetch<Run>("/api/runs", { method: "POST", body: JSON.stringify(run) }),

  get: (id: string) =>
    apiFetch<Run>(`/api/runs/${id}`),

  update: (id: string, patch: Partial<Run>) =>
    apiFetch<Run>(`/api/runs/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  delete: (id: string) =>
    apiFetch<void>(`/api/runs/${id}`, { method: "DELETE" }),
};
```

All five repositories follow this same shape.

---

## Login screen (`src/ui/auth/login-screen.tsx`)

Route: `/login`

Two states:
1. **Email form** — single email input + "Send magic link" button
2. **Sent** — "Check your email" message with the address shown

```
┌─────────────────────────────┐
│  DynoRun                    │
│                             │
│  Sign in                    │
│  ┌─────────────────────┐    │
│  │ your@email.com      │    │
│  └─────────────────────┘    │
│  [ Send magic link ]        │
└─────────────────────────────┘
```

On submit: calls `authClient.signIn.magicLink({ email })`. On success, transitions to the "check your email" state.

---

## Route protection

`App.tsx` wraps all existing routes in a `<RequireAuth>` component:

```tsx
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

`/login` is the only public route. After magic link verification, better-auth redirects to `/` and the cookie is set — `RequireAuth` passes through.

---

## Environment variable

One new env var for the frontend, only needed in local dev:

```
# .env.local (not committed)
VITE_API_URL=http://localhost:3000
```

In production the variable is empty — the frontend is served from the same nginx origin as the API (`/api/` proxy), so same-origin fetch works without a base URL. No `.env.production` file needed.

---

## Data migration

No migration of existing local data. The web version stored data in-memory (lost on every page refresh anyway), so there's no data worth migrating. Users start fresh with a new account.

---

## Build changes

- Remove `sql.js` from `package.json` dependencies
- `vite.config.ts` had no sql.js-specific config — no changes needed
- The `database-capacitor.ts` path is removed; Capacitor native support is out of scope for now (the app is being used primarily via the web server)
