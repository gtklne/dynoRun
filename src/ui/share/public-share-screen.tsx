import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { shareRepository, type PublicShareData } from '@/api/repositories/share-repository';
import { BrandLogo } from '@/ui/components/brand-logo';
import { Wordmark } from '@/ui/components/brand-wordmark';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import { ConditionsChips } from '@/ui/run/conditions-chips';
import { useUnits } from '@/app/units-context';
import { formatPower, type PowerUnit } from '@/shared/format-power';
import { formatShortDateTime } from '@/shared/format-time';
import {
  MinimaTable,
  Na,
  NoReading,
  NotesBox,
  PlanView,
  PlateAnchor,
  Readout,
  RevisionBar,
  TitleBlock,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';
import type { RpmPoint } from '@/shared/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: PublicShareData };

const DEFAULT_TITLE = 'DynoRun';

const WHEEL_POWER_CAVEAT =
  'Wheel power is estimated from GPS acceleration, vehicle mass, gearing and road-load assumptions. It is not a calibrated rolling-road dyno reading, and it carries no driveline-loss correction: read it as a figure comparable against the other runs on this vehicle, not as an absolute rating.';

function setMetaContent(selector: string, content: string): void {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute('content', content);
}

function applyShareMeta(title: string, description: string): void {
  document.title = title;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);
}

function buildShareMeta(data: PublicShareData, unit: PowerUnit): { title: string; description: string } {
  const { run, vehicle, curve } = data;
  const peak = curve.points.reduce<{ wheel_power_kw: number; rpm: number } | null>((best, p) => {
    if (best == null || p.wheel_power_kw > best.wheel_power_kw) return p;
    return best;
  }, null);
  const baseTitle = run.title ?? `${vehicle.name} · ${run.gear_label}`;
  const title = peak
    ? `${baseTitle}: ${formatPower(peak.wheel_power_kw, unit)}`
    : baseTitle;
  const description = peak
    ? `Peak ${formatPower(peak.wheel_power_kw, unit)} @ ${peak.rpm.toFixed(0)} RPM · ${vehicle.name} · DynoRun`
    : `${vehicle.name} run · DynoRun`;
  return { title, description };
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-sheet)' }}>
      <header className="rule-b pt-safe px-4 py-2.5">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 lg:max-w-5xl">
          <a
            href="https://wasgoht.ch"
            className="flex items-center gap-2 no-underline"
            aria-label="DynoRun home"
            style={{ color: 'var(--color-ink)' }}
          >
            <BrandLogo size={22} />
            <Wordmark brand="dynorun" className="text-base" />
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-12 lg:max-w-5xl">
        {children}
      </main>
      <footer className="rule-t px-4 py-6 text-center">
        <p className="t-body mx-auto text-sm">
          Track your own vehicle&apos;s power at{' '}
          <a href="https://wasgoht.ch" className="no-underline hover:underline" style={{ color: 'var(--color-procedure)' }}>
            wasgoht.ch
          </a>
        </p>
      </footer>
    </div>
  );
}

const BIN_COLUMNS: MinimaColumn<RpmPoint>[] = [
  { key: 'rpm', head: 'RPM', numeric: true, cell: (p) => p.rpm.toFixed(0) },
  { key: 'power', head: 'Wheel power (kW)', numeric: true, cell: (p) => p.wheel_power_kw.toFixed(1) },
  { key: 'torque', head: 'Wheel torque (Nm)', numeric: true, cell: (p) => p.wheel_torque_nm.toFixed(0) },
];

export function PublicShareScreen() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const units = useUnits();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await shareRepository.getPublic(token);
        if (cancelled) return;
        if (!data) setState({ kind: 'error' });
        else setState({ kind: 'ready', data });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (state.kind === 'ready') {
      const meta = buildShareMeta(state.data, units.unit);
      applyShareMeta(meta.title, meta.description);
    }
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [state, units.unit]);

  const peak = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const points = state.data.curve.points;
    if (points.length === 0) return null;
    return points.reduce((best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best), points[0]);
  }, [state]);

  const peakTorque = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const points = state.data.curve.points;
    if (points.length === 0) return null;
    return points.reduce((best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best), points[0]);
  }, [state]);

  if (state.kind === 'loading') {
    return (
      <Frame>
        <div className="flex items-center justify-center py-16">
          <p className="t-annotation">Loading shared run...</p>
        </div>
      </Frame>
    );
  }

  if (state.kind === 'error') {
    return (
      <Frame>
        <div className="plate-stack">
          <TitleBlock title="Shared run unavailable" />
          <Zone label="What happened">
            <p className="t-body px-3 py-3 text-[0.875rem] leading-6">
              This link does not resolve to a run any more. The owner may have revoked it, or the
              URL is mistyped.
            </p>
            <div className="rule-t px-3 py-3">
              <PlateAnchor href="https://wasgoht.ch" variant="procedure">
                Go to DynoRun
              </PlateAnchor>
            </div>
          </Zone>
        </div>
      </Frame>
    );
  }

  const { run, vehicle, curve } = state.data;
  const titleText = run.title ?? `${vehicle.name}, ${run.gear_label}`;
  const opp = units.unit === 'kW' ? 'hp' : 'kW';
  const hasCurve = curve.points.length > 0;

  return (
    <Frame>
      <div className="plate-stack">
        <TitleBlock
          ident={vehicle.name}
          title={titleText}
          meta={[
            { label: 'Vehicle', value: vehicle.name },
            { label: 'Gear', value: run.gear_label },
            { label: 'Recorded', value: formatShortDateTime(run.started_at) },
            {
              label: 'RPM range',
              value: hasCurve ? `${curve.rpm_min.toFixed(0)}-${curve.rpm_max.toFixed(0)}` : <Na />,
            },
          ]}
        />

        <div className="space-y-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-8 lg:items-start lg:space-y-0">
          <div className="space-y-6">
            <Zone label="Peak readings" note={`also shown in ${opp}`}>
              <div className="grid grid-cols-2">
                <div className="px-3 py-3">
                  {peak ? (
                    <Readout
                      value={formatPower(peak.wheel_power_kw, units.unit, { unitSuffix: false })}
                      unit={units.unit}
                      label="Peak wheel power"
                      tone="procedure"
                      note={formatPower(peak.wheel_power_kw, opp)}
                    />
                  ) : (
                    <NoReading label="Peak wheel power" reason="This run derived no curve" />
                  )}
                </div>
                <div className="rule-l px-3 py-3">
                  {peakTorque ? (
                    <Readout
                      value={peakTorque.wheel_torque_nm.toFixed(0)}
                      unit="Nm"
                      label="Peak wheel torque"
                      note={`at ${peakTorque.rpm.toFixed(0)} RPM`}
                    />
                  ) : (
                    <NoReading label="Peak wheel torque" reason="This run derived no curve" />
                  )}
                </div>
                <div className="rule-t col-span-2 px-3 py-3">
                  {peak ? (
                    <Readout value={peak.rpm.toFixed(0)} unit="RPM" label="Peak power at" />
                  ) : (
                    <NoReading label="Peak power at" reason="This run derived no curve" />
                  )}
                </div>
              </div>
            </Zone>

            <Zone label="Conditions" note="stated by the owner">
              {run.conditions &&
              (run.conditions.ambient_temp_c != null ||
                run.conditions.wind_kmh != null ||
                run.conditions.road_slope_pct != null ||
                run.conditions.surface) ? (
                <div className="px-3 py-3">
                  <ConditionsChips conditions={run.conditions} size="md" />
                </div>
              ) : (
                <div className="hatch px-3 py-5 text-center">
                  <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
                    No conditions were logged for this run
                  </p>
                </div>
              )}
            </Zone>
          </div>

          <div className="space-y-6">
            <PlanView
              label="Wheel power vs RPM"
              scale={
                hasCurve
                  ? `${curve.rpm_min.toFixed(0)}-${curve.rpm_max.toFixed(0)} RPM, 100 RPM bins, ${units.unit}`
                  : 'no curve'
              }
            >
              {hasCurve ? (
                <PowerCurveChart
                  series={[{ label: 'Power', points: curve.points }]}
                  mode="power"
                  unit={units.unit}
                />
              ) : (
                <div className="hatch px-3 py-12 text-center">
                  <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
                    No curve was derived for this run
                  </p>
                </div>
              )}
            </PlanView>

            {hasCurve && (
              <Zone label="RPM bins" note="the values the curve is drawn from">
                <MinimaTable columns={BIN_COLUMNS} rows={curve.points} rowKey={(p) => String(p.rpm)} />
              </Zone>
            )}
          </div>
        </div>

        <NotesBox>{WHEEL_POWER_CAVEAT}</NotesBox>

        <RevisionBar
          entries={[
            { label: 'Pipeline', value: `v${curve.pipeline_version}` },
            { label: 'Run started', value: formatShortDateTime(run.started_at) },
            { label: 'Bins', value: curve.points.length },
            { label: 'Source', value: 'GPS speed, no external hardware' },
          ]}
        />
      </div>
    </Frame>
  );
}
