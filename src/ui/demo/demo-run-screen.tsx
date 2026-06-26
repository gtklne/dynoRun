import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { analyzeRun } from '@/analysis/pipeline';
import { computeRollout } from '@/shared/units';
import { BrandLogo } from '@/ui/components/brand-logo';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import { AccelTimesCard } from '@/ui/components/accel-times-card';
import { RunQualityBadge } from '@/ui/components/run-quality-badge';
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
    document.title = 'DynoRun — example run';
    return () => {
      document.title = prev;
    };
  }, []);

  const opp = units.unit === 'kW' ? 'hp' : 'kW';

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="pt-safe bg-zinc-950 border-b border-zinc-800/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2 max-w-2xl w-full mx-auto lg:max-w-5xl">
          <Link to="/" className="flex items-center gap-2" aria-label="DynoRun home">
            <BrandLogo size={22} />
            <span className="font-bold text-lg tracking-tight">
              <span className="text-amber-400">dyno</span>
              <span className="text-zinc-100">Run</span>
            </span>
          </Link>
          <Link
            to="/login"
            className="bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-12 max-w-2xl w-full mx-auto lg:max-w-5xl">
        <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-8 lg:items-start lg:space-y-0">
          <div className="space-y-5">
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 space-y-2">
            <p className="text-amber-300 text-xs font-semibold uppercase tracking-widest">Example run</p>
            <p className="text-zinc-100 text-sm leading-6">
              This is what your data looks like once you record a run. The curve and stats
              below are derived from a synthetic GPS trace, but the analysis is the same
              one the app runs on your real drives.
            </p>
            <Link
              to="/login"
              className="inline-block mt-1 text-amber-400 hover:text-amber-300 text-sm font-semibold"
            >
              Sign in to record your own →
            </Link>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-100">{DEMO_RECORDING.vehicle_label}</h1>
            <RunQualityBadge quality={analyzed.quality} />
          </div>
          <p className="text-zinc-500 text-sm -mt-3">
            {DEMO_RECORDING.gear_label} · {DEMO_RECORDING.vehicle_mass_kg} kg · example data
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak power</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-amber-400">
                  {peak ? formatPower(peak.wheel_power_kw, units.unit, { unitSuffix: false }) : '—'}
                </span>
                <span className="text-sm text-zinc-400 ml-1">{units.unit}</span>
              </p>
              <p className="text-zinc-600 text-xs mt-1">
                {peak ? formatPower(peak.wheel_power_kw, opp) : '—'}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak torque</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-zinc-100">
                  {peakTorque ? peakTorque.wheel_torque_nm.toFixed(0) : '—'}
                </span>
                <span className="text-sm text-zinc-400 ml-1">Nm</span>
              </p>
              <p className="text-zinc-600 text-xs mt-1">
                {peakTorque ? `@ ${peakTorque.rpm.toFixed(0)} RPM` : '—'}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 col-span-2">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak power RPM</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-zinc-100">
                  {peak ? peak.rpm.toFixed(0) : '—'}
                </span>
                <span className="text-sm text-zinc-400 ml-1">RPM</span>
              </p>
            </div>
          </div>

          <AccelTimesCard accel={analyzed.accel_times} />
          </div>

          <div className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
            <PowerCurveChart
              series={[{ label: 'Power', points: analyzed.points }]}
              mode="power"
              unit={units.unit}
            />
          </div>

          <p className="text-zinc-600 text-xs text-center">
            Wheel power derived from GPS · DynoRun
          </p>
          </div>
        </div>
      </main>

      <footer className="px-4 py-6 border-t border-zinc-800/60 text-center bg-zinc-950">
        <p className="text-zinc-400 text-sm">
          Ready to try with your car?{' '}
          <Link
            to="/login"
            className="text-amber-400 hover:text-amber-300 font-semibold transition-colors"
          >
            Sign in
          </Link>
        </p>
      </footer>
    </div>
  );
}
