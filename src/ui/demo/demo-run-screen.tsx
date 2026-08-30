import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { analyzeRun } from '@/analysis/pipeline';
import { PIPELINE_VERSION } from '@/analysis/types';
import { computeRollout } from '@/shared/units';
import { SuiteMark, Wordmark } from '@/ui/components/brand-wordmark';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import { AccelTimesCard } from '@/ui/components/accel-times-card';
import { RunQualityBadge } from '@/ui/components/run-quality-badge';
import { StatTile } from '@/ui/components/stat-tile';
import {
  NotesBox,
  PlanView,
  Plate,
  Readout,
  RevisionBar,
  TitleBlock,
  Zone,
} from '@/ui/plate';
import { useUnits } from '@/app/units-context';
import { formatPower } from '@/shared/format-power';
import { DEMO_RECORDING } from '@/demo/example-recording';

export function DemoRunScreen() {
  const units = useUnits();

  const analyzed = useMemo(() => {
    const rollout = computeRollout(
      DEMO_RECORDING.calibration.rpm,
      DEMO_RECORDING.calibration.speed_kmh,
    );
    return analyzeRun({
      samples: DEMO_RECORDING.samples,
      mass_kg: DEMO_RECORDING.vehicle_mass_kg,
      rollout_m_per_rev: rollout,
    });
  }, []);

  const peak = useMemo(() => {
    if (analyzed.points.length === 0) return null;
    return analyzed.points.reduce(
      (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
      analyzed.points[0],
    );
  }, [analyzed]);

  const peakTorque = useMemo(() => {
    if (analyzed.points.length === 0) return null;
    return analyzed.points.reduce(
      (best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best),
      analyzed.points[0],
    );
  }, [analyzed]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'DynoRun: example run';
    return () => {
      document.title = prev;
    };
  }, []);

  const opp = units.unit === 'kW' ? 'hp' : 'kW';

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-sheet)' }}>
      <header className="rule-b pt-safe flex items-center justify-between gap-4 px-4 py-3">
        <Link
          to="/hello"
          className="flex items-center gap-2.5 no-underline"
          style={{ color: 'var(--color-ink)' }}
          aria-label="wasgoht home"
        >
          <SuiteMark size={22} />
          <Wordmark brand="suite" className="text-[0.9375rem]" />
        </Link>
        <Link to="/login" className="ctl ctl-solid no-underline">
          Sign in
        </Link>
      </header>

      <main className="flex-1 px-4 pt-5 pb-12 lg:px-8 lg:pt-8">
        <Plate className="plate-issue mx-auto w-full lg:max-w-5xl">
          <TitleBlock
            ident={DEMO_RECORDING.vehicle_label}
            title="Example run"
            meta={[
              { label: 'Gear', value: DEMO_RECORDING.gear_label },
              { label: 'Mass', value: `${DEMO_RECORDING.vehicle_mass_kg} kg` },
              { label: 'Source', value: 'Synthetic GPS trace' },
              { label: 'Signal', value: <RunQualityBadge quality={analyzed.quality} /> },
            ]}
            actions={
              <Link to="/login" className="ctl ctl-solid no-underline">
                Sign in to record your own
              </Link>
            }
          />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
            <PlanView
              label="Wheel power vs RPM"
              scale={`100 RPM bins, pipeline v${PIPELINE_VERSION}`}
            >
              <div className="p-2">
                <PowerCurveChart
                  series={[{ label: 'Power', points: analyzed.points }]}
                  mode="power"
                  unit={units.unit}
                />
              </div>
            </PlanView>

            <div className="flex flex-col gap-8">
              <Zone label="Minima" note="Peak readings from this run">
                {/* One monumental reading, then the two that qualify it. A row of
                    equal-sized giant figures competes with itself and, in a narrow
                    column, collides. */}
                <div className="px-3 py-3">
                  <Readout
                    label="Peak power"
                    value={
                      peak
                        ? formatPower(peak.wheel_power_kw, units.unit, { unitSuffix: false })
                        : 'n/a'
                    }
                    unit={units.unit}
                    note={peak ? formatPower(peak.wheel_power_kw, opp) : 'n/a'}
                  />
                </div>
                <div className="rule-t grid grid-cols-2">
                  <StatTile
                    label="Peak torque"
                    value={peakTorque ? `${peakTorque.wheel_torque_nm.toFixed(0)} Nm` : 'n/a'}
                    subtitle={peakTorque ? `at ${peakTorque.rpm.toFixed(0)} RPM` : undefined}
                  />
                  <div className="rule-l">
                    <StatTile
                      label="Peak power RPM"
                      value={peak ? `${peak.rpm.toFixed(0)} RPM` : 'n/a'}
                      subtitle="100 RPM bins"
                    />
                  </div>
                </div>
              </Zone>

              <AccelTimesCard accel={analyzed.accel_times} />
            </div>
          </div>

          <NotesBox title="What you are looking at">
            This is what your data looks like once you record a run. The curve and readings
            are derived from a synthetic GPS trace, but the analysis is the same one the app
            runs on your real drives. Wheel power is estimated from GPS acceleration, vehicle
            mass, gearing and road-load assumptions. It is not a replacement for a calibrated
            rolling-road dyno.
          </NotesBox>

          <RevisionBar
            entries={[
              { label: 'Pipeline', value: `v${PIPELINE_VERSION}` },
              { label: 'Sample grid', value: '100 ms, Savitzky-Golay window 11' },
              { label: 'Source', value: 'Synthetic trace, no vehicle was driven' },
            ]}
          />
        </Plate>
      </main>

      <footer className="rule-t px-4 py-6 text-center">
        <p className="t-body mx-auto">
          Ready to try with your car?{' '}
          <Link to="/login" className="underline" style={{ color: 'var(--color-ink)' }}>
            Sign in
          </Link>
        </p>
      </footer>
    </div>
  );
}
