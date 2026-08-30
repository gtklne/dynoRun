import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { vehicleRepository } from '@/api/repositories/vehicle-repository';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { runRepository } from '@/api/repositories/run-repository';
import { useUnits } from '@/app/units-context';
import { useToast } from '@/ui/components/toast';
import { reanalyzeVehicleRuns } from '@/analysis/re-analyze';
import { formatRelativeTime } from '@/shared/format-time';
import { PeakTrendChart } from '@/ui/components/peak-trend-chart';
import {
  Advisory,
  Chevron,
  MinimaTable,
  Na,
  NotesBox,
  PlateButton,
  PlateLink,
  ProfileView,
  RevisionBar,
  TitleBlock,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';
import type { Vehicle, Calibration, Run, Transmission, VehicleKind } from '@/shared/types';
import type { NewVehicle } from '@/api/repositories/types';
import { VehicleForm } from './vehicle-form';

// Editing any of these changes the derived power curve, so stored runs must be
// recomputed; name/notes/make/etc. do not.
function affectsPower(before: Vehicle, after: NewVehicle): boolean {
  return (
    before.mass_kg !== after.mass_kg ||
    before.kind !== after.kind ||
    before.drag_coefficient !== after.drag_coefficient ||
    before.frontal_area_m2 !== after.frontal_area_m2
  );
}

const TRANSMISSION_LABEL: Record<Transmission, string> = {
  manual: 'Manual',
  dct: 'DCT',
  automatic: 'Automatic',
  cvt: 'CVT',
};

const STATUS_LABEL: Record<string, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  degraded: 'Degraded',
  aborted: 'Aborted',
};

/**
 * Only a run that needs a second look gets colour, and the traffic light says
 * which kind: aborted is a run that produced nothing, degraded is one whose
 * curve should be read twice. Complete is the expected state and stays in
 * plain ink, so spending a hue on it would leave nothing to mark the others.
 */
function statusStyle(status: string) {
  if (status === 'aborted') return { color: 'var(--color-stop)' };
  if (status === 'degraded') return { color: 'var(--color-caution)' };
  if (status === 'in_progress') return { color: 'var(--color-ink-2)' };
  return undefined;
}

// A rider cannot reach the phone during a pull, so on a motorcycle the
// hands-free session is the primary action and the tap-to-start run is the
// fallback. On a car the driver can reach the screen, so the order flips.
function CalibrationActions({ vehicleId, calibrationId, kind }: {
  vehicleId: string;
  calibrationId: string;
  kind: VehicleKind;
}) {
  const actions = [
    { to: `/vehicles/${vehicleId}/calibrations/${calibrationId}/run`, label: 'New run' },
    { to: `/vehicles/${vehicleId}/calibrations/${calibrationId}/session`, label: 'Hands-free' },
  ];
  if (kind === 'motorcycle') actions.reverse();
  return (
    <div className="flex shrink-0 flex-col items-stretch gap-1">
      {actions.map((a, i) => (
        <PlateLink key={a.to} to={a.to} variant={i === 0 ? 'procedure' : 'outline'}>
          {a.label}
        </PlateLink>
      ))}
    </div>
  );
}

function heroLine(vehicle: Vehicle): string {
  const parts: string[] = [];
  if (vehicle.year != null) parts.push(String(vehicle.year));
  if (vehicle.make) parts.push(vehicle.make);
  if (vehicle.model) parts.push(vehicle.model);
  return parts.length > 0 ? parts.join(' ') : vehicle.name;
}

function secondaryParts(vehicle: Vehicle): string[] {
  const parts: string[] = [];
  if (vehicle.tire_label) parts.push(vehicle.tire_label);
  if (vehicle.transmission) parts.push(TRANSMISSION_LABEL[vehicle.transmission]);
  if (vehicle.power_hp_factory != null) parts.push(`factory about ${vehicle.power_hp_factory} hp`);
  return parts;
}

export function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [cals, setCals] = useState<Calibration[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [editing, setEditing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { format } = useUnits();
  const toast = useToast();

  useEffect(() => {
    if (!id) return;
    (async () => {
      setVehicle(await vehicleRepository.get(id));
      setCals(await calibrationRepository.listByVehicle(id));
      setRuns(await runRepository.listByVehicle(id));
    })();
  }, [id]);

  if (!vehicle) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="t-annotation">Loading...</p>
      </div>
    );
  }

  const completeRuns = runs.filter((r) => r.status === 'complete');
  const bestPeak = completeRuns.reduce<number | null>((acc, r) => {
    if (r.peak_power_kw == null) return acc;
    return acc === null || r.peak_power_kw > acc ? r.peak_power_kw : acc;
  }, null);
  const mostRecent = runs.length > 0
    ? runs.reduce((a, b) => (new Date(a.started_at).getTime() >= new Date(b.started_at).getTime() ? a : b))
    : null;

  const hero = heroLine(vehicle);
  const secondary = secondaryParts(vehicle);
  const showSubName = hero !== vehicle.name && Boolean(vehicle.name);

  const runColumns: MinimaColumn<Run>[] = [
    {
      key: 'title',
      head: 'Run',
      cell: (r) => <span className="t-data text-sm">{r.title ?? r.gear_label}</span>,
    },
    { key: 'gear', head: 'Gear', cell: (r) => r.gear_label },
    { key: 'when', head: 'When', cell: (r) => formatRelativeTime(r.started_at) },
    {
      key: 'peak',
      head: 'Peak',
      numeric: true,
      cell: (r) =>
        r.status === 'complete' && r.peak_power_kw != null ? (
          format(r.peak_power_kw)
        ) : (
          <Na title="No peak recorded for this run" />
        ),
    },
    {
      key: 'status',
      head: 'Status',
      cell: (r) => (
        <span style={statusStyle(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</span>
      ),
    },
    {
      key: 'open',
      head: 'Sheet',
      cell: (r) =>
        r.status === 'complete' ? (
          <Link to={`/runs/${r.id}/review`} className="t-label no-underline hover:underline">
            Review
          </Link>
        ) : (
          <Na title="Only a complete run has a review sheet" />
        ),
    },
  ];

  async function handleDelete() {
    if (!vehicle) return;
    const runNote = runs.length > 0
      ? ` Its ${runs.length} run${runs.length === 1 ? '' : 's'} and all calibrations will be deleted too.`
      : '';
    if (!confirm(`Delete "${vehicle.name}"?${runNote} This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await vehicleRepository.delete(vehicle.id);
      toast.show('Vehicle deleted', { variant: 'success' });
      navigate('/garage');
    } catch {
      toast.show('Failed to delete vehicle', { variant: 'error' });
      setDeleting(false);
    }
  }

  return (
    <div className="plate-stack">
      <div>
        <Link
          to="/garage"
          className="t-label mb-2 inline-flex items-center gap-1.5 no-underline hover:underline"
        >
          <Chevron direction="left" />
          Garage
        </Link>

        <TitleBlock
          ident={showSubName ? vehicle.name : undefined}
          title={hero}
          meta={[
            { label: 'Mass', value: `${vehicle.mass_kg} kg` },
            { label: 'Drivetrain', value: vehicle.drivetrain.toUpperCase() },
            { label: 'Kind', value: vehicle.kind },
            {
              label: 'Best power',
              value: bestPeak == null ? <Na title="No complete run yet" /> : format(bestPeak),
            },
          ]}
          actions={
            !editing ? (
              <PlateButton onClick={() => setEditing(true)}>Edit</PlateButton>
            ) : undefined
          }
        />
      </div>

      {recomputing && (
        <Advisory>Recomputing power curves for this vehicle&apos;s runs.</Advisory>
      )}

      {editing && (
        <Zone label="Edit vehicle">
          <VehicleForm
              initial={vehicle}
              onSubmit={async (input) => {
                const needsRecompute = affectsPower(vehicle, input);
                const updated = await vehicleRepository.update(vehicle.id, input);
                setVehicle(updated);
                setEditing(false);
                if (!needsRecompute) return;
                setRecomputing(true);
                try {
                  const count = await reanalyzeVehicleRuns(updated.id);
                  setRuns(await runRepository.listByVehicle(updated.id));
                  toast.show(
                    count === 0
                      ? 'Vehicle updated (no runs to recompute'
                      : `Vehicle updated) recomputed ${count} run${count === 1 ? '' : 's'}`,
                    { variant: 'success' },
                  );
                } catch {
                  toast.show('Vehicle saved, but recomputing runs failed', { variant: 'error' });
                } finally {
                  setRecomputing(false);
                }
              }}
            onCancel={() => setEditing(false)}
          />
        </Zone>
      )}

      {!editing && (secondary.length > 0 || vehicle.notes) && (
        <NotesBox title="Vehicle notes">
          {secondary.length > 0 && <p>{secondary.join(', ')}</p>}
          {vehicle.notes && <p>{vehicle.notes}</p>}
        </NotesBox>
      )}

      {/* Desktop: config and identity in the narrow left column, performance
          and history in the wide right column. Mobile keeps the stacked order
          (the left column's content precedes the right's in the DOM). */}
      <div className="plate-stack lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:items-start">
        <div className="plate-stack lg:col-span-1">
          <Zone
            label="Calibrations"
            note={`${cals.length} on file`}
            actions={
              <PlateLink to={`/vehicles/${vehicle.id}/calibrations/new`}>New</PlateLink>
            }
            flush
          >
            {cals.length === 0 ? (
              <div className="hatch px-3 py-6 text-center">
                <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
                  No calibrations yet. Add one to start a run.
                </p>
              </div>
            ) : (
              cals.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 ${i > 0 ? 'rule-t' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="t-data text-sm">{c.gear_label}</p>
                    <p className="t-annotation mt-0.5">
                      {c.rpm.toFixed(0)} RPM at {c.speed_kmh.toFixed(1)} km/h
                    </p>
                    <p className="t-annotation mt-0.5">
                      {c.rollout_m_per_rev.toFixed(4)} m/rev
                    </p>
                  </div>
                  <CalibrationActions vehicleId={vehicle.id} calibrationId={c.id} kind={vehicle.kind} />
                </div>
              ))
            )}
          </Zone>

          {completeRuns.length >= 2 && (
            <Zone label="Comparison">
              <p className="t-body mb-2 text-[0.8125rem] leading-6">
                {completeRuns.length} complete runs available to overlay on one RPM axis.
              </p>
              <PlateLink to={`/vehicles/${vehicle.id}/compare`} variant="solid" className="w-full">
                Compare runs
              </PlateLink>
            </Zone>
          )}
        </div>

        <div className="plate-stack lg:col-span-2">
          <ProfileView
            label="Peak power trend"
            axis={
              mostRecent
                ? `Last run ${formatRelativeTime(mostRecent.started_at)}`
                : 'No runs recorded'
            }
          >
            <div className="p-1.5">
              <PeakTrendChart
                runs={runs}
                onSelectRun={(runId) => navigate(`/runs/${runId}/review`)}
              />
            </div>
          </ProfileView>

          <Zone
            label="Run history"
            note={`${runs.length} recorded, ${completeRuns.length} complete`}
            flush
          >
            <MinimaTable
              columns={runColumns}
              rows={runs}
              rowKey={(r) => r.id}
              empty="No runs yet."
            />
          </Zone>
        </div>
      </div>

      {!editing && (
        <Zone label="Remove this vehicle">
          <p className="t-body mb-2 text-[0.8125rem] leading-6">
            Deleting a vehicle deletes its calibrations and every run recorded against it. This
            cannot be undone.
          </p>
          <PlateButton
            onClick={handleDelete}
            disabled={deleting}
            className="w-full lg:w-auto"
            style={{ color: 'var(--color-stop)' }}
          >
            {deleting ? 'Deleting...' : 'Delete vehicle'}
          </PlateButton>
        </Zone>
      )}

      <RevisionBar
        entries={[
          { label: 'Vehicle added', value: formatRelativeTime(vehicle.created_at) },
          { label: 'Last edited', value: formatRelativeTime(vehicle.updated_at) },
          {
            label: 'Mass used for F=ma',
            value: `${vehicle.mass_kg} kg`,
          },
        ]}
      />
    </div>
  );
}
