import { useEffect, useState } from 'react';
import {
  fetchAdminActivity,
  fetchAdminOverview,
  fetchAdminTimeseries,
  type AdminActivity,
  type AdminOverview,
  type AdminTimeseries,
  type AdminUserRow,
  fetchAdminUsers,
  type AdminDistributionEntry,
} from '@/api/admin';
import { fillDailySeries } from '@/shared/daily-series';
import { formatPower } from '@/shared/format-power';
import { useUnits } from '@/app/units-context';
import { StatTile } from '@/ui/components/stat-tile';
import { DailySeriesChart } from './daily-series-chart';

const SIGNUP_DAYS = 90;
const ACTIVITY_DAYS = 60;
const SERIES_AMBER = '#fbbf24';
const SERIES_SKY = '#38bdf8';

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (!isFinite(ts)) return '—';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d} d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mo ago`;
  return `${Math.floor(mo / 12)} y ago`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  return isFinite(ts) ? new Date(ts).toLocaleDateString() : '—';
}

function SectionHeader({ children }: { children: string }) {
  return (
    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{children}</p>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">{children}</div>;
}

function DistributionList({ title, entries }: { title: string; entries: AdminDistributionEntry[] }) {
  const max = entries.reduce((m, e) => Math.max(m, e.count), 0);
  return (
    <Card>
      <p className="text-zinc-400 text-sm font-medium mb-3">{title}</p>
      {entries.length === 0 && <p className="text-zinc-600 text-sm">No data yet.</p>}
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.label} className="flex items-center gap-3">
            <span className="text-zinc-300 text-sm w-28 truncate capitalize">{e.label}</span>
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400/70 rounded-full"
                style={{ width: max > 0 ? `${(e.count / max) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-zinc-400 text-sm tabular-nums w-8 text-right">{e.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const statusColor: Record<string, string> = {
  complete: 'text-emerald-400',
  aborted: 'text-red-400',
  in_progress: 'text-amber-400',
  analyzing: 'text-amber-400',
};

export function AdminScreen() {
  const { unit } = useUnits();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [timeseries, setTimeseries] = useState<AdminTimeseries | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [activity, setActivity] = useState<AdminActivity | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAdminOverview(),
      fetchAdminTimeseries(SIGNUP_DAYS),
      fetchAdminUsers(),
      fetchAdminActivity(),
    ]).then(([o, t, u, a]) => {
      if (cancelled) return;
      setOverview(o);
      setTimeseries(t);
      setUsers(u);
      setActivity(a);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <p className="text-zinc-500 text-sm py-8 text-center">Couldn't load admin data.</p>;
  }
  if (!overview || !timeseries || !users || !activity) {
    return <p className="text-zinc-500 text-sm py-8 text-center">Loading…</p>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const signupSeries = [{
    label: 'Signups / day',
    color: SERIES_AMBER,
    data: fillDailySeries(timeseries.signups, SIGNUP_DAYS, today),
  }];
  const activitySeries = [
    {
      label: 'Runs / day',
      color: SERIES_AMBER,
      data: fillDailySeries(timeseries.runs, ACTIVITY_DAYS, today),
    },
    {
      label: 'Recordings / day',
      color: SERIES_SKY,
      data: fillDailySeries(timeseries.recordings, ACTIVITY_DAYS, today),
    },
  ];

  const { users: u, activity: act, content, health } = overview;
  const abortedPct = content.runs_total > 0
    ? `${Math.round((content.runs_aborted / content.runs_total) * 100)}% of all runs`
    : undefined;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-zinc-100">Admin</h1>

      <section className="space-y-2">
        <SectionHeader>Users</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile label="Total users" value={String(u.total)} accent />
          <StatTile label="New (7 d)" value={String(u.new_7d)} />
          <StatTile label="New (30 d)" value={String(u.new_30d)} />
          <StatTile label="Active (7 d)" value={String(act.active_7d)} subtitle="session activity" />
          <StatTile label="Active (30 d)" value={String(act.active_30d)} subtitle="session activity" />
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeader>Content</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile label="Vehicles" value={String(content.vehicles)} />
          <StatTile label="Runs" value={String(content.runs_total)} subtitle={`${content.runs_complete} complete`} />
          <StatTile label="Aborted runs" value={String(content.runs_aborted)} subtitle={abortedPct} />
          <StatTile label="Calibrations" value={String(content.calibrations)} />
          <StatTile label="Recordings" value={String(content.recordings)} />
        </div>
      </section>

      <div className="space-y-8 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
        <section className="space-y-2">
          <SectionHeader>Signups — last 90 days</SectionHeader>
          <Card>
            <DailySeriesChart series={signupSeries} testId="admin-signups-chart" />
          </Card>
        </section>

        <section className="space-y-2">
          <SectionHeader>Activity — last 60 days</SectionHeader>
          <Card>
            <DailySeriesChart series={activitySeries} testId="admin-activity-chart" />
          </Card>
        </section>
      </div>

      <section className="space-y-2">
        <SectionHeader>System health</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile label="Database" value={health.db_size} />
          <StatTile label="Samples" value={health.samples_size} subtitle={`${content.samples.toLocaleString()} rows`} />
          <StatTile label="Recordings" value={health.recordings_size} subtitle="jsonb payloads" />
          <StatTile label="Shared runs" value={String(content.runs_shared)} />
          <StatTile
            label="Stuck runs"
            value={String(health.stuck_runs)}
            subtitle={health.stuck_runs > 0 ? '⚠ in analyzing > 1 h' : 'none'}
          />
          <StatTile
            label="Curve versions"
            value={health.curve_versions.map((v) => `v${v.version}: ${v.count}`).join(', ') || '—'}
            subtitle="pipeline versions in use"
          />
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeader>{`All users (${users.length})`}</SectionHeader>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-800">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Last active</th>
                <th className="px-4 py-3 font-medium text-right">Vehicles</th>
                <th className="px-4 py-3 font-medium text-right">Runs</th>
                <th className="px-4 py-3 font-medium text-right">Recordings</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-3 text-zinc-200">
                    <span className="truncate">{row.email}</span>
                    {row.role === 'admin' && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5">admin</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{timeAgo(row.last_active)}</td>
                  <td className="px-4 py-3 text-zinc-300 text-right tabular-nums">{row.vehicle_count}</td>
                  <td className="px-4 py-3 text-zinc-300 text-right tabular-nums">{row.run_count}</td>
                  <td className="px-4 py-3 text-zinc-300 text-right tabular-nums">{row.recording_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="space-y-8 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6">
        <section className="space-y-2">
          <SectionHeader>Recent runs</SectionHeader>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/60">
            {activity.recent_runs.length === 0 && (
              <p className="text-zinc-600 text-sm p-4">No runs yet.</p>
            )}
            {activity.recent_runs.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-200 text-sm truncate">
                    {r.vehicle_name ?? 'Unknown vehicle'}
                    <span className="text-zinc-500"> · {r.gear_label}</span>
                  </p>
                  <p className="text-zinc-500 text-xs truncate">{r.user_email} · {timeAgo(r.started_at)}</p>
                </div>
                <span className="text-zinc-300 text-sm tabular-nums whitespace-nowrap">
                  {formatPower(r.peak_power_kw, unit)}
                </span>
                <span className={`text-xs whitespace-nowrap ${statusColor[r.status] ?? 'text-zinc-500'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <div className="space-y-2">
            <SectionHeader>Top peak power</SectionHeader>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/60">
              {activity.top_runs.length === 0 && (
                <p className="text-zinc-600 text-sm p-4">No complete runs yet.</p>
              )}
              {activity.top_runs.map((r, i) => (
                <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-zinc-600 text-sm tabular-nums w-5">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-200 text-sm truncate">{r.vehicle_name ?? 'Unknown vehicle'}</p>
                    <p className="text-zinc-500 text-xs truncate">{r.user_email}</p>
                  </div>
                  <span className="text-amber-400 text-sm font-semibold tabular-nums whitespace-nowrap">
                    {formatPower(r.peak_power_kw, unit)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DistributionList title="Vehicle kinds" entries={activity.vehicle_kinds} />
            <DistributionList title="Drivetrains" entries={activity.drivetrains} />
          </div>
        </section>
      </div>
    </div>
  );
}
