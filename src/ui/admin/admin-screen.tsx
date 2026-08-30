import { useEffect, useState, type ReactNode } from 'react';
import {
  fetchAdminActivity,
  fetchAdminOverview,
  fetchAdminTimeseries,
  type AdminActivity,
  type AdminOverview,
  type AdminRecentRun,
  type AdminTimeseries,
  type AdminTopRun,
  type AdminUserRow,
  fetchAdminUsers,
  type AdminDistributionEntry,
} from '@/api/admin';
import { fillDailySeries } from '@/shared/daily-series';
import { formatPower } from '@/shared/format-power';
import { useUnits } from '@/app/units-context';
import { StatTile } from '@/ui/components/stat-tile';
import {
  Advisory,
  MinimaTable,
  Na,
  PlanView,
  ProfileView,
  TitleBlock,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';
import { DailySeriesChart } from './daily-series-chart';

const SIGNUP_DAYS = 90;
const ACTIVITY_DAYS = 60;

function timeAgo(iso: string | null | undefined): ReactNode {
  if (!iso) return <Na />;
  const ts = Date.parse(iso);
  if (!isFinite(ts)) return <Na />;
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

function formatDate(iso: string | null | undefined): ReactNode {
  if (!iso) return <Na />;
  const ts = Date.parse(iso);
  return isFinite(ts) ? new Date(ts).toLocaleDateString() : <Na />;
}

/**
 * A block of readings inside one frame. The gap-px trick makes the container's
 * own background show through as a hairline between cells, so the block reads
 * as one ruled table at every breakpoint instead of a grid of floating tiles.
 */
function FigureBlock({ children, columns }: { children: ReactNode; columns: string }) {
  return (
    <div className={`grid gap-px ${columns}`} style={{ background: 'var(--color-grid-strong)' }}>
      {children}
    </div>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <div style={{ background: 'var(--color-plane)' }}>{children}</div>;
}

function DistributionList({ title, entries }: { title: string; entries: AdminDistributionEntry[] }) {
  const max = entries.reduce((m, e) => Math.max(m, e.count), 0);
  return (
    <Zone label={title} flush>
      {entries.length === 0 ? (
        <div className="hatch px-3 py-5 text-center">
          <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
            No data yet
          </p>
        </div>
      ) : (
        <div>
          {entries.map((e, i) => (
            <div
              key={e.label}
              className={`flex items-center gap-3 px-3 py-1.5 ${i > 0 ? 'rule-t' : ''}`}
            >
              <span className="t-data w-28 shrink-0 truncate text-sm capitalize">{e.label}</span>
              <span
                className="h-2.5 flex-1"
                style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)' }}
              >
                <span
                  className="block h-full"
                  style={{
                    width: max > 0 ? `${(e.count / max) * 100}%` : '0%',
                    background: 'var(--color-ink)',
                  }}
                />
              </span>
              <span className="t-data w-8 shrink-0 text-right text-sm">{e.count}</span>
            </div>
          ))}
        </div>
      )}
    </Zone>
  );
}

/**
 * Aborted is the only run status that asks the operator to look twice, so it is
 * the only one that spends a hue, and it takes red because an aborted run is a
 * measurement that was lost. The rest stay in plain ink.
 */
function statusStyle(status: string) {
  return status === 'aborted' ? { color: 'var(--color-stop)' } : undefined;
}

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
    return (
      <div className="plate-stack">
        <TitleBlock title="Admin" />
        <Advisory>Could not load admin data.</Advisory>
      </div>
    );
  }
  if (!overview || !timeseries || !users || !activity) {
    return <p className="t-annotation py-8 text-center">Loading...</p>;
  }

  const today = new Date().toISOString().slice(0, 10);
  const signupSeries = [{
    label: 'Signups / day',
    data: fillDailySeries(timeseries.signups, SIGNUP_DAYS, today),
  }];
  const activitySeries = [
    {
      label: 'Runs / day',
      data: fillDailySeries(timeseries.runs, ACTIVITY_DAYS, today),
    },
    {
      label: 'Recordings / day',
      data: fillDailySeries(timeseries.recordings, ACTIVITY_DAYS, today),
    },
  ];

  const { users: u, activity: act, content, health } = overview;
  const abortedPct = content.runs_total > 0
    ? `${Math.round((content.runs_aborted / content.runs_total) * 100)}% of all runs`
    : undefined;

  const userColumns: MinimaColumn<AdminUserRow>[] = [
    {
      key: 'email',
      head: 'Email',
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="truncate">{row.email}</span>
          {row.role === 'admin' && (
            <span
              className="t-annotation plane-2 shrink-0 px-1.5 py-0.5"
              style={{ color: 'var(--color-ink)' }}
            >
              admin
            </span>
          )}
        </span>
      ),
    },
    { key: 'joined', head: 'Joined', cell: (row) => formatDate(row.created_at) },
    { key: 'active', head: 'Last active', cell: (row) => timeAgo(row.last_active) },
    { key: 'vehicles', head: 'Vehicles', numeric: true, cell: (row) => row.vehicle_count },
    { key: 'runs', head: 'Runs', numeric: true, cell: (row) => row.run_count },
    { key: 'recordings', head: 'Recordings', numeric: true, cell: (row) => row.recording_count },
  ];

  const recentColumns: MinimaColumn<AdminRecentRun>[] = [
    {
      key: 'vehicle',
      head: 'Vehicle',
      cell: (r) =>
        r.vehicle_name ?? <Na title="The vehicle was deleted" />,
    },
    { key: 'gear', head: 'Gear', cell: (r) => r.gear_label },
    { key: 'user', head: 'User', cell: (r) => <span className="block max-w-[20ch] truncate">{r.user_email}</span> },
    { key: 'when', head: 'Started', cell: (r) => timeAgo(r.started_at) },
    {
      key: 'peak',
      head: `Peak (${unit})`,
      numeric: true,
      cell: (r) =>
        r.peak_power_kw == null ? (
          <Na title="No curve was derived" />
        ) : (
          formatPower(r.peak_power_kw, unit, { unitSuffix: false })
        ),
    },
    {
      key: 'status',
      head: 'Status',
      cell: (r) => (
        <span className="t-label" style={statusStyle(r.status)}>
          {r.status}
        </span>
      ),
    },
  ];

  const topColumns: MinimaColumn<AdminTopRun>[] = [
    {
      key: 'vehicle',
      head: 'Vehicle',
      cell: (r) => r.vehicle_name ?? <Na title="The vehicle was deleted" />,
    },
    { key: 'user', head: 'User', cell: (r) => <span className="block max-w-[20ch] truncate">{r.user_email}</span> },
    {
      key: 'peak',
      head: `Peak (${unit})`,
      numeric: true,
      cell: (r) => (
        <span className="t-data">{formatPower(r.peak_power_kw, unit, { unitSuffix: false })}</span>
      ),
    },
  ];

  return (
    <div className="plate-stack">
      <TitleBlock
        title="Admin"
        meta={[
          { label: 'Users', value: u.total },
          { label: 'Runs', value: content.runs_total },
          { label: 'Database', value: health.db_size },
          {
            label: 'Stuck runs',
            value:
              health.stuck_runs > 0 ? (
                <span style={{ color: 'var(--color-stop)' }}>{health.stuck_runs}</span>
              ) : (
                0
              ),
          },
        ]}
      />

      {health.stuck_runs > 0 && (
        <Advisory>
          {health.stuck_runs} {health.stuck_runs === 1 ? 'run has' : 'runs have'} been in the
          analyzing state for over an hour. Their samples uploaded but the curve never landed, so
          they will never leave that state on their own.
        </Advisory>
      )}

      <Zone label="Users" note="accounts and session activity" flush>
        <FigureBlock columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Cell><StatTile label="Total users" value={String(u.total)} accent /></Cell>
          <Cell><StatTile label="New (7 d)" value={String(u.new_7d)} /></Cell>
          <Cell><StatTile label="New (30 d)" value={String(u.new_30d)} /></Cell>
          <Cell><StatTile label="Active (7 d)" value={String(act.active_7d)} subtitle="session activity" /></Cell>
          <Cell><StatTile label="Active (30 d)" value={String(act.active_30d)} subtitle="session activity" /></Cell>
        </FigureBlock>
      </Zone>

      <Zone label="Content" note="what users have recorded" flush>
        <FigureBlock columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Cell><StatTile label="Vehicles" value={String(content.vehicles)} /></Cell>
          <Cell><StatTile label="Runs" value={String(content.runs_total)} subtitle={`${content.runs_complete} complete`} /></Cell>
          <Cell><StatTile label="Aborted runs" value={String(content.runs_aborted)} subtitle={abortedPct} /></Cell>
          <Cell><StatTile label="Calibrations" value={String(content.calibrations)} /></Cell>
          <Cell><StatTile label="Recordings" value={String(content.recordings)} /></Cell>
        </FigureBlock>
      </Zone>

      <div className="plate-stack lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <PlanView label="Signups" scale={`daily count, last ${SIGNUP_DAYS} days`}>
          <div className="p-1.5">
            <DailySeriesChart series={signupSeries} testId="admin-signups-chart" />
          </div>
        </PlanView>

        <ProfileView label="Runs and recordings" axis={`daily count, last ${ACTIVITY_DAYS} days`}>
          <div className="p-1.5">
            <DailySeriesChart series={activitySeries} testId="admin-activity-chart" />
          </div>
        </ProfileView>
      </div>

      <Zone label="System health" note="storage and pipeline state" flush>
        <FigureBlock columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <Cell><StatTile label="Database" value={health.db_size} /></Cell>
          <Cell><StatTile label="Samples" value={health.samples_size} subtitle={`${content.samples.toLocaleString()} rows`} /></Cell>
          <Cell><StatTile label="Recordings" value={health.recordings_size} subtitle="jsonb payloads" /></Cell>
          <Cell><StatTile label="Shared runs" value={String(content.runs_shared)} /></Cell>
          <Cell>
            <StatTile
              label="Stuck runs"
              value={String(health.stuck_runs)}
              subtitle={health.stuck_runs > 0 ? 'in analyzing over 1 h' : 'none'}
              tone={health.stuck_runs > 0 ? 'stop' : 'ink'}
            />
          </Cell>
          <Cell>
            <StatTile
              label="Curve versions"
              value={health.curve_versions.map((v) => `v${v.version}: ${v.count}`).join(', ') || 'n/a'}
              subtitle="pipeline versions in use"
            />
          </Cell>
        </FigureBlock>
      </Zone>

      <Zone label="All users" note={`${users.length} accounts`} flush>
        <MinimaTable
          columns={userColumns}
          rows={users}
          rowKey={(row) => row.id}
          empty="No users yet"
        />
      </Zone>

      <div className="plate-stack lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
        <Zone label="Recent runs" flush>
          <MinimaTable
            columns={recentColumns}
            rows={activity.recent_runs}
            rowKey={(r) => r.id}
            empty="No runs yet"
          />
        </Zone>

        <div className="plate-stack">
          <Zone label="Top peak power" note="highest wheel power recorded" flush>
            <MinimaTable
              columns={topColumns}
              rows={activity.top_runs}
              rowKey={(r) => r.id}
              empty="No complete runs yet"
            />
          </Zone>

          <div className="plate-stack sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
            <DistributionList title="Vehicle kinds" entries={activity.vehicle_kinds} />
            <DistributionList title="Drivetrains" entries={activity.drivetrains} />
          </div>
        </div>
      </div>
    </div>
  );
}
