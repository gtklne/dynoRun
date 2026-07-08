import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { gripSessions } from '../schema.js';
import { requireAuth, type AuthVariables } from '../middleware/require-auth.js';

const route = new Hono<{ Variables: AuthVariables }>();
route.use(requireAuth);

const CHANNEL_KEYS = ['t', 'lat', 'lon', 'spd', 'lean', 'lap', 'head'] as const;

interface GripDataEnvelope {
  version: number;
  meta: { track?: unknown; config?: unknown; date?: unknown; best?: unknown; laps?: unknown };
  ch: Record<(typeof CHANNEL_KEYS)[number], number[]>;
}

// Structural check of the stored envelope (mirror of the client-side guard in
// src/analysis/grip/storage.ts — the server can't import client code).
function isGripDataEnvelope(v: unknown): v is GripDataEnvelope {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  if (d.version !== 1 || !d.meta || typeof d.meta !== 'object') return false;
  const ch = d.ch as Record<string, unknown> | undefined;
  if (!ch || typeof ch !== 'object') return false;
  const t = ch.t;
  if (!Array.isArray(t) || t.length === 0) return false;
  return CHANNEL_KEYS.every((k) => Array.isArray(ch[k]) && (ch[k] as unknown[]).length === t.length);
}

const summaryColumns = {
  id: gripSessions.id,
  vehicle_id: gripSessions.vehicle_id,
  label: gripSessions.label,
  track: gripSessions.track,
  config: gripSessions.config,
  session_date: gripSessions.session_date,
  best_lap_s: gripSessions.best_lap_s,
  lap_count: gripSessions.lap_count,
  sample_count: gripSessions.sample_count,
  duration_s: gripSessions.duration_s,
  created_at: gripSessions.created_at,
  updated_at: gripSessions.updated_at,
};

// List all grip sessions for the current user (summaries only, no channel data)
route.get('/grip-sessions', async (c) => {
  const userId = c.get('userId');
  const rows = await db.select(summaryColumns)
    .from(gripSessions)
    .where(eq(gripSessions.userId, userId))
    .orderBy(desc(gripSessions.created_at));
  return c.json(rows);
});

// Fetch a single session including channel data + tuned settings
route.get('/grip-sessions/:id', async (c) => {
  const userId = c.get('userId');
  const [row] = await db.select().from(gripSessions)
    .where(and(eq(gripSessions.id, c.req.param('id')), eq(gripSessions.userId, userId)));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

// Create a session. Summary columns are derived server-side from the envelope
// so a client can never make the listing disagree with the stored channels.
route.post('/grip-sessions', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    label?: string | null;
    vehicle_id?: string | null;
    settings?: unknown;
    data: unknown;
  }>();

  if (!isGripDataEnvelope(body.data)) {
    return c.json({ error: 'invalid data envelope' }, 400);
  }
  const { meta, ch } = body.data;
  const laps = Array.isArray(meta.laps) ? meta.laps : [];
  const best = typeof meta.best === 'number' && Number.isFinite(meta.best) ? meta.best : null;

  const now = new Date().toISOString();
  const [row] = await db.insert(gripSessions).values({
    id: crypto.randomUUID(),
    userId,
    vehicle_id: body.vehicle_id ?? null,
    label: body.label ?? null,
    track: typeof meta.track === 'string' ? meta.track : '',
    config: typeof meta.config === 'string' ? meta.config : '',
    session_date: typeof meta.date === 'string' ? meta.date : '',
    best_lap_s: best,
    lap_count: laps.length,
    sample_count: ch.t.length,
    duration_s: ch.t[ch.t.length - 1] ?? 0,
    settings: body.settings ?? null,
    data: body.data,
    created_at: now,
    updated_at: now,
  }).returning(summaryColumns);

  return c.json(row, 201);
});

// Patch metadata: label, vehicle link, tuned settings
route.patch('/grip-sessions/:id', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ label?: string | null; vehicle_id?: string | null; settings?: unknown }>();
  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.vehicle_id !== undefined) patch.vehicle_id = body.vehicle_id;
  if (body.settings !== undefined) patch.settings = body.settings;
  if (Object.keys(patch).length === 0) return c.json({ error: 'no fields' }, 400);
  patch.updated_at = new Date().toISOString();

  const [row] = await db.update(gripSessions).set(patch)
    .where(and(eq(gripSessions.id, c.req.param('id')), eq(gripSessions.userId, userId)))
    .returning(summaryColumns);
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});

route.delete('/grip-sessions/:id', async (c) => {
  const userId = c.get('userId');
  const result = await db.delete(gripSessions)
    .where(and(eq(gripSessions.id, c.req.param('id')), eq(gripSessions.userId, userId)))
    .returning({ id: gripSessions.id });
  if (result.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.body(null, 204);
});

export { route as gripSessionsRoute };
