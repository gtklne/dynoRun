import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/ui/components/brand-logo';
import { GripMark } from '@/ui/components/brand-wordmark';
import { Plate, RevisionBar, TitleBlock, Zone } from '@/ui/plate';
import { computeDashboard, useGarageData, HeroStats, RecentActivity } from './dashboard';

function ForwardIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
      className="shrink-0"
    >
      <line x1="4" y1="12" x2="20" y2="12" />
      <polyline points="14 6 20 12 14 18" />
    </svg>
  );
}

/**
 * One tool of the suite, as a ruled line rather than a tile. The two tools sit
 * in one frame separated by a hairline, so the home screen reads as the binder
 * index it is instead of a grid of identical cards.
 */
function ToolRow({
  to,
  mark,
  name,
  input,
  blurb,
  divider,
}: {
  to: string;
  mark: React.ReactNode;
  name: string;
  input: string;
  blurb: string;
  divider: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-4 px-3 py-4 no-underline transition-colors hover:bg-[var(--color-plane-2)] ${divider ? 'rule-t' : ''}`}
      style={{ color: 'var(--color-ink)' }}
    >
      <span className="shrink-0">{mark}</span>
      <span className="min-w-0 flex-1">
        <span className="t-plate-title block">{name}</span>
        <span className="t-body mt-1 block text-[0.8125rem] leading-6">{blurb}</span>
        <span className="t-annotation mt-1.5 block">Input: {input}</span>
      </span>
      <ForwardIcon />
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
    <Plate className="plate-issue">
      <TitleBlock
        ident="wasgoht"
        title="Home"
        meta={[
          { label: 'Tools', value: 'DynoRun, Grip' },
          { label: 'Vehicles', value: vehicles ? String(vehicles.length) : 'Loading' },
          { label: 'Complete runs', value: dashboard ? String(dashboard.totalRuns) : 'Loading' },
          { label: 'Account', value: 'One, both tools' },
        ]}
      />

      <Zone label="Tools" note="Pick the sheet you need">
        <ToolRow
          to="/garage"
          mark={<BrandLogo size={30} />}
          name="DynoRun"
          input="GPS speed from this phone"
          blurb="Drive one gear, derive a wheel-power curve from the acceleration, then overlay runs on one RPM axis."
          divider={false}
        />
        <ToolRow
          to="/grip"
          mark={<GripMark size={30} />}
          name="Grip Utilization"
          input="A RaceBox session CSV"
          blurb="Traction envelope, per-corner load, and lap-vs-lap comparison on a spatial axis."
          divider
        />
      </Zone>

      {showSnapshot && dashboard && (
        <>
          <HeroStats
            peak={dashboard.peak}
            totalRuns={dashboard.totalRuns}
            vehicleCount={vehicles!.length}
          />
          {dashboard.recent.length > 0 && <RecentActivity rows={dashboard.recent} />}
        </>
      )}

      <RevisionBar
        entries={[
          { label: 'Power', value: 'Wheel power, comparative estimate' },
          { label: 'Grip score', value: 'Measured g demand x 100' },
        ]}
      />
    </Plate>
  );
}
