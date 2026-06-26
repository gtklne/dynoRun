import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import { AccelTimesCard } from '@/ui/components/accel-times-card';
import { RunQualityBadge } from '@/ui/components/run-quality-badge';
import { formatPower, type PowerUnit } from '@/shared/format-power';
import type { AnalyzedRun } from '@/analysis/types';

interface RunResultProps {
  kind: 'run';
  analyzed: AnalyzedRun;
  unit: PowerUnit;
}

interface CalibrationResultProps {
  kind: 'calibration';
  steadySpeedKmh: number;
  userRpm: number | null;
  impliedRollout: number | null;
}

type ReplayResultPanelProps = RunResultProps | CalibrationResultProps;

export function ReplayResultPanel(props: ReplayResultPanelProps) {
  if (props.kind === 'calibration') {
    const { steadySpeedKmh, userRpm, impliedRollout } = props;
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Calibration hold</p>
        <p className="text-zinc-400 text-sm">
          This is a steady-state calibration recording — there's no power curve to derive.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Steady speed</p>
            <p className="tabular-nums">
              <span className="text-2xl font-bold text-zinc-100">{steadySpeedKmh.toFixed(1)}</span>
              <span className="text-xs text-zinc-400 ml-1">km/h</span>
            </p>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">Implied rollout</p>
            <p className="tabular-nums">
              <span className="text-2xl font-bold text-amber-400">
                {impliedRollout != null ? impliedRollout.toFixed(4) : '—'}
              </span>
              <span className="text-xs text-zinc-400 ml-1">m/rev</span>
            </p>
            <p className="text-zinc-600 text-[10px] mt-1">
              {userRpm != null ? `@ ${userRpm.toFixed(0)} RPM` : 'no RPM in recording'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { analyzed, unit } = props;
  if (analyzed.points.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <p className="text-zinc-400 text-sm">Not enough data for a power curve.</p>
        <p className="text-zinc-600 text-xs mt-1">Check mass and rollout, or the recording may be too short.</p>
      </div>
    );
  }

  const peak = analyzed.points.reduce(
    (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
    analyzed.points[0],
  );
  const peakTorque = analyzed.points.reduce(
    (best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best),
    analyzed.points[0],
  );
  const opp: PowerUnit = unit === 'kW' ? 'hp' : 'kW';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Result</p>
        <RunQualityBadge quality={analyzed.quality} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak power</p>
          <p className="tabular-nums">
            <span className="text-3xl font-bold text-amber-400">
              {formatPower(peak.wheel_power_kw, unit, { unitSuffix: false })}
            </span>
            <span className="text-sm text-zinc-400 ml-1">{unit}</span>
          </p>
          <p className="text-zinc-600 text-xs mt-1">{formatPower(peak.wheel_power_kw, opp)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak torque</p>
          <p className="tabular-nums">
            <span className="text-3xl font-bold text-zinc-100">{peakTorque.wheel_torque_nm.toFixed(0)}</span>
            <span className="text-sm text-zinc-400 ml-1">Nm</span>
          </p>
          <p className="text-zinc-600 text-xs mt-1">@ {peakTorque.rpm.toFixed(0)} RPM</p>
        </div>
      </div>

      <AccelTimesCard accel={analyzed.accel_times} />

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
        <PowerCurveChart series={[{ label: 'Power', points: analyzed.points }]} mode="power" unit={unit} />
      </div>
      <p className="text-zinc-600 text-[11px] text-center">
        Derived in-memory · pipeline v{analyzed.pipeline_version} · nothing saved
      </p>
    </div>
  );
}
