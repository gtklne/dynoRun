import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { useUnits } from '@/app/units-context';
import type { Run, Vehicle } from '@/shared/types';
import { computeDashboard, useGarageData, HeroStats, RecentActivity } from '@/ui/home/dashboard';
import { Chevron, Na, PlateButton, PlateLink, TitleBlock, Zone } from '@/ui/plate';
import { VehicleForm } from './vehicle-form';

interface VehicleStats {
  runCount: number;
  bestPeakKw: number | null;
}

function statsFor(runs: Run[]): VehicleStats {
  const complete = runs.filter((r) => r.status === 'complete');
  let bestPeakKw: number | null = null;
  for (const r of complete) {
    if (r.peak_power_kw == null) continue;
    if (bestPeakKw === null || r.peak_power_kw > bestPeakKw) {
      bestPeakKw = r.peak_power_kw;
    }
  }
  return { runCount: complete.length, bestPeakKw };
}

/**
 * One ruled row of the garage index, not a card. The whole row is the link, so
 * the target stays glove-sized, and the reading on the right is the one figure
 * that distinguishes vehicles from each other.
 */
function VehicleRow({
  vehicle,
  stats,
  first,
}: {
  vehicle: Vehicle;
  stats: VehicleStats;
  first: boolean;
}) {
  const { format } = useUnits();
  return (
    <Link
      to={`/vehicles/${vehicle.id}`}
      className={`flex items-center gap-3 px-3 py-2.5 no-underline transition-colors hover:bg-[var(--color-plane-2)] ${first ? '' : 'rule-t'}`}
      style={{ color: 'var(--color-ink)' }}
    >
      <span className="min-w-0 flex-1">
        <span className="t-data block truncate text-[0.9375rem]">{vehicle.name}</span>
        <span className="t-annotation mt-0.5 block truncate">
          {vehicle.kind} / {vehicle.mass_kg} kg / {vehicle.drivetrain.toUpperCase()}
        </span>
        {vehicle.notes && <span className="t-annotation mt-0.5 block truncate">{vehicle.notes}</span>}
      </span>
      <span className="shrink-0 text-right">
        <span className="t-annotation block">
          {stats.runCount === 0 ? 'No runs' : `${stats.runCount} run${stats.runCount === 1 ? '' : 's'}`}
        </span>
        <span className="t-data mt-0.5 block text-sm">
          {stats.bestPeakKw == null ? <Na title="No complete run yet" /> : format(stats.bestPeakKw)}
        </span>
      </span>
      <Chevron size={16} />
    </Link>
  );
}

const ONBOARDING_STEPS = [
  'Add your vehicle (mass matters, physics is F=ma)',
  'Calibrate a gear (drive at known RPM to capture your speed/RPM ratio)',
  'Drive and record (the app derives your power curve from GPS acceleration)',
];

function Onboarding() {
  return (
    <Zone label="How it works" actions={<PlateLink to="/demo">See an example run</PlateLink>} flush>
      <ol>
        {ONBOARDING_STEPS.map((text, i) => (
          <li key={text} className={`flex items-start gap-3 px-3 py-2 ${i > 0 ? 'rule-t' : ''}`}>
            <span
              aria-hidden="true"
              className="t-data flex h-6 w-6 shrink-0 items-center justify-center text-xs"
              style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)' }}
            >
              {i + 1}
            </span>
            <span className="t-body text-[0.875rem] leading-6">{text}</span>
          </li>
        ))}
      </ol>
    </Zone>
  );
}

export function GarageScreen() {
  const { vehicles, runsByVehicle, reload } = useGarageData();
  const [adding, setAdding] = useState(false);

  const dashboard = useMemo(
    () => (vehicles ? computeDashboard(vehicles, runsByVehicle) : null),
    [vehicles, runsByVehicle],
  );

  if (vehicles === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="t-annotation">Loading...</p>
      </div>
    );
  }

  const showDashboard = vehicles.length > 0 && dashboard !== null && dashboard.totalRuns > 0;
  const showRecent = vehicles.length > 0 && dashboard !== null && dashboard.recent.length > 0;

  return (
    <div className="plate-stack">
      {/* No meta row here on purpose: the counts it would carry are the same
          two readings HeroStats states below, and a plate never prints one
          measurement twice. */}
      <TitleBlock
        title="Garage"
        actions={
          !adding && vehicles.length > 0 ? (
            <PlateButton variant="procedure" onClick={() => setAdding(true)}>
              Add vehicle
            </PlateButton>
          ) : undefined
        }
      />

      {adding && (
        <Zone label="New vehicle">
          <VehicleForm
            onSubmit={async (input) => {
              await vehicleRepository.create(input);
              setAdding(false);
              await reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </Zone>
      )}

      {vehicles.length === 0 && !adding && (
        <>
          <Onboarding />
          <Zone label="Vehicles" flush>
            <div className="hatch px-3 py-8 text-center">
              <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
                No vehicles yet.
              </p>
            </div>
          </Zone>
          <PlateButton variant="procedure" major onClick={() => setAdding(true)}>
            Add vehicle
          </PlateButton>
        </>
      )}

      {showDashboard && dashboard && (
        <HeroStats peak={dashboard.peak} totalRuns={dashboard.totalRuns} vehicleCount={vehicles.length} />
      )}

      {/* Desktop: the vehicle index fills the wide left column, recent activity
          sits in the right rail. Mobile keeps the stacked order (recent above
          vehicles) via DOM order + lg:order on desktop. */}
      {(showRecent || vehicles.length > 0) && (
        <div className="plate-stack lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:items-start">
          {showRecent && dashboard && (
            <div className="lg:order-2 lg:col-span-1">
              <RecentActivity rows={dashboard.recent} />
            </div>
          )}
          {vehicles.length > 0 && (
            <div className={`lg:order-1 ${showRecent ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <Zone label="Vehicles" note={`${vehicles.length} in this garage`} flush>
                {vehicles.map((v, i) => (
                  <VehicleRow
                    key={v.id}
                    vehicle={v}
                    stats={statsFor(runsByVehicle.get(v.id) ?? [])}
                    first={i === 0}
                  />
                ))}
              </Zone>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
