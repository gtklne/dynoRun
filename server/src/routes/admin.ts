import { Hono } from 'hono';
import { pool } from '../db.js';
import { requireAdmin, type AdminVariables } from '../middleware/require-admin.js';

const route = new Hono<{ Variables: AdminVariables }>();
route.use('/admin/*', requireAdmin);

// App tables store created_at as ISO-8601 TEXT (UTC, trailing Z), while the
// better-auth tables use real TIMESTAMP columns — hence the ::timestamptz
// casts on app tables only.

route.get('/admin/overview', async (c) => {
  const [users, activity, content, health] = await Promise.all([
    pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE "createdAt" > now() - interval '7 days')::int AS new_7d,
        count(*) FILTER (WHERE "createdAt" > now() - interval '30 days')::int AS new_30d
      FROM "user"
    `),
    pool.query(`
      SELECT
        count(DISTINCT "userId") FILTER (WHERE "updatedAt" > now() - interval '7 days')::int AS active_7d,
        count(DISTINCT "userId") FILTER (WHERE "updatedAt" > now() - interval '30 days')::int AS active_30d
      FROM session
    `),
    pool.query(`
      SELECT
        (SELECT count(*) FROM vehicles)::int AS vehicles,
        (SELECT count(*) FROM calibrations)::int AS calibrations,
        (SELECT count(*) FROM runs)::int AS runs_total,
        (SELECT count(*) FROM runs WHERE status = 'complete')::int AS runs_complete,
        (SELECT count(*) FROM runs WHERE status = 'aborted')::int AS runs_aborted,
        (SELECT count(*) FROM runs WHERE share_token IS NOT NULL)::int AS runs_shared,
        (SELECT count(*) FROM recordings)::int AS recordings,
        (SELECT count(*) FROM samples)::int AS samples
    `),
    pool.query(`
      SELECT
        pg_size_pretty(pg_database_size(current_database())) AS db_size,
        pg_size_pretty(pg_total_relation_size('samples')) AS samples_size,
        pg_size_pretty(pg_total_relation_size('recordings')) AS recordings_size,
        (SELECT count(*) FROM runs
          WHERE status IN ('in_progress', 'analyzing')
            AND created_at::timestamptz < now() - interval '1 hour')::int AS stuck_runs,
        (SELECT coalesce(json_agg(json_build_object('version', pipeline_version, 'count', cnt) ORDER BY pipeline_version), '[]'::json)
          FROM (SELECT pipeline_version, count(*)::int AS cnt FROM derived_curves GROUP BY pipeline_version) pv
        ) AS curve_versions
    `),
  ]);
  return c.json({
    users: users.rows[0],
    activity: activity.rows[0],
    content: content.rows[0],
    health: health.rows[0],
  });
});

route.get('/admin/timeseries', async (c) => {
  const raw = parseInt(c.req.query('days') ?? '90', 10);
  const days = Number.isFinite(raw) ? Math.min(365, Math.max(7, raw)) : 90;
  const [signups, runs, recordings] = await Promise.all([
    pool.query(`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "user"
      WHERE "createdAt" > now() - make_interval(days => $1)
      GROUP BY 1 ORDER BY 1
    `, [days]),
    pool.query(`
      SELECT to_char(date_trunc('day', created_at::timestamptz), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM runs
      WHERE created_at::timestamptz > now() - make_interval(days => $1)
      GROUP BY 1 ORDER BY 1
    `, [days]),
    pool.query(`
      SELECT to_char(date_trunc('day', created_at::timestamptz), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM recordings
      WHERE created_at::timestamptz > now() - make_interval(days => $1)
      GROUP BY 1 ORDER BY 1
    `, [days]),
  ]);
  return c.json({
    days,
    signups: signups.rows,
    runs: runs.rows,
    recordings: recordings.rows,
  });
});

route.get('/admin/users', async (c) => {
  const { rows } = await pool.query(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.role,
      to_char(u."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(s.last_active AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_active,
      coalesce(v.cnt, 0)::int AS vehicle_count,
      coalesce(r.cnt, 0)::int AS run_count,
      coalesce(rec.cnt, 0)::int AS recording_count,
      r.last_run_at
    FROM "user" u
    LEFT JOIN (SELECT "userId", max("updatedAt") AS last_active FROM session GROUP BY 1) s ON s."userId" = u.id
    LEFT JOIN (SELECT user_id, count(*) AS cnt FROM vehicles GROUP BY 1) v ON v.user_id = u.id
    LEFT JOIN (SELECT user_id, count(*) AS cnt, max(created_at) AS last_run_at FROM runs GROUP BY 1) r ON r.user_id = u.id
    LEFT JOIN (SELECT user_id, count(*) AS cnt FROM recordings GROUP BY 1) rec ON rec.user_id = u.id
    ORDER BY u."createdAt" DESC
    LIMIT 500
  `);
  return c.json(rows);
});

route.get('/admin/activity', async (c) => {
  const [recentRuns, topRuns, kinds, drivetrains] = await Promise.all([
    pool.query(`
      SELECT r.id, r.status, r.started_at, r.gear_label, r.peak_power_kw, r.title,
             u.email AS user_email, v.name AS vehicle_name
      FROM runs r
      JOIN "user" u ON u.id = r.user_id
      LEFT JOIN vehicles v ON v.id = r.vehicle_id
      ORDER BY r.created_at DESC
      LIMIT 25
    `),
    pool.query(`
      SELECT r.id, r.started_at, r.gear_label, r.peak_power_kw, r.peak_power_rpm,
             u.email AS user_email, v.name AS vehicle_name, v.kind AS vehicle_kind
      FROM runs r
      JOIN "user" u ON u.id = r.user_id
      LEFT JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.status = 'complete' AND r.peak_power_kw IS NOT NULL
      ORDER BY r.peak_power_kw DESC
      LIMIT 10
    `),
    pool.query(`SELECT kind AS label, count(*)::int AS count FROM vehicles GROUP BY 1 ORDER BY 2 DESC`),
    pool.query(`SELECT drivetrain AS label, count(*)::int AS count FROM vehicles GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  return c.json({
    recent_runs: recentRuns.rows,
    top_runs: topRuns.rows,
    vehicle_kinds: kinds.rows,
    drivetrains: drivetrains.rows,
  });
});

export { route as adminRoute };
