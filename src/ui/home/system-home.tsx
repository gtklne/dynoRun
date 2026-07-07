import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/ui/components/brand-logo';
import { computeDashboard, useGarageData, HeroStats, RecentActivity } from './dashboard';

const GRIP_BLUE = '#4c95ec';

function GripGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={GRIP_BLUE} strokeWidth="2" aria-hidden="true">
      <circle cx="16" cy="16" r="12" opacity="0.45" />
      <circle cx="16" cy="16" r="7" />
      <line x1="16" y1="3" x2="16" y2="29" opacity="0.3" />
      <line x1="3" y1="16" x2="29" y2="16" opacity="0.3" />
      <circle cx="20.5" cy="11.5" r="2.4" fill={GRIP_BLUE} stroke="none" />
    </svg>
  );
}

function ToolTile({ to, accent, icon, name, blurb }: { to: string; accent: string; icon: ReactNode; name: string; blurb: string }) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `radial-gradient(420px 200px at 15% -20%, ${accent}22, transparent 70%)` }}
      />
      <div className="relative flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
          {icon}
        </div>
        <p className="text-base font-semibold text-zinc-100">{name}</p>
      </div>
      <p className="relative mt-3 text-sm text-zinc-400">{blurb}</p>
      <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: accent }}>
        Open
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </Link>
  );
}

export function SystemHome() {
  const { vehicles, runsByVehicle } = useGarageData();
  const dashboard = useMemo(
    () => (vehicles ? computeDashboard(vehicles, runsByVehicle) : null),
    [vehicles, runsByVehicle],
  );

  const showSnapshot = !!vehicles && vehicles.length > 0 && !!dashboard && dashboard.totalRuns > 0;

  return (
    <div className="space-y-8 lg:space-y-10">
      <header>
        <h1 className="text-2xl font-bold text-zinc-100 lg:text-3xl">Home</h1>
        <p className="mt-1 text-sm text-zinc-500">Your motorsport telemetry tools, in one place.</p>
      </header>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Tools</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ToolTile
            to="/garage"
            accent="#f59e0b"
            icon={<BrandLogo size={26} />}
            name="DynoRun"
            blurb="GPS virtual dyno — drive one gear and derive a wheel-power curve."
          />
          <ToolTile
            to="/grip"
            accent={GRIP_BLUE}
            icon={<GripGlyph size={26} />}
            name="Grip Utilization"
            blurb="RaceBox track-session traction-circle & grip analyzer."
          />
        </div>
      </section>

      {showSnapshot && dashboard && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">DynoRun · at a glance</p>
            <Link to="/garage" className="text-xs font-semibold text-amber-400 hover:text-amber-300">Open garage →</Link>
          </div>
          <HeroStats peak={dashboard.peak} totalRuns={dashboard.totalRuns} vehicleCount={vehicles!.length} />
          {dashboard.recent.length > 0 && <RecentActivity rows={dashboard.recent} />}
        </section>
      )}
    </div>
  );
}
