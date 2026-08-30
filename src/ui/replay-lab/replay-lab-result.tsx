import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import { AccelTimesCard } from '@/ui/components/accel-times-card';
import { RunQualityBadge } from '@/ui/components/run-quality-badge';
import { formatPower, type PowerUnit } from '@/shared/format-power';
import type { AnalyzedRun } from '@/analysis/types';
import { NoReading, NotesBox, PlanView, Readout, RevisionBar, Zone } from '@/ui/plate';

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

const WHEEL_POWER_CAVEAT =
  'Wheel power is estimated from GPS acceleration, vehicle mass, gearing and road-load assumptions. It is not a calibrated rolling-road dyno reading: treat it as a figure to compare against your own other runs, not as an absolute rating.';

export function ReplayResultPanel(props: ReplayResultPanelProps) {
  if (props.kind === 'calibration') {
    const { steadySpeedKmh, userRpm, impliedRollout } = props;
    return (
      <div className="space-y-4">
        <Zone
          label="Calibration hold"
          note="Steady state, so there is no power curve to derive"
        >
          <div className="grid grid-cols-2">
            <div className="px-3 py-3">
              <Readout
                value={steadySpeedKmh.toFixed(1)}
                unit="km/h"
                label="Steady speed"
                size="md"
              />
            </div>
            <div className="rule-l px-3 py-3">
              {impliedRollout != null ? (
                <Readout
                  value={impliedRollout.toFixed(4)}
                  unit="m/rev"
                  label="Implied rollout"
                  tone="procedure"
                  note={userRpm != null ? `at ${userRpm.toFixed(0)} RPM` : undefined}
                />
              ) : (
                <NoReading
                  label="Implied rollout"
                  reason="The recording carries no target RPM, so speed alone cannot give a ratio"
                />
              )}
            </div>
          </div>
        </Zone>

        <NotesBox>
          Rollout bundles tyre circumference, gear ratio and final drive into one number. It is only
          meaningful if this hold really was the gear and RPM you meant to capture.
        </NotesBox>
      </div>
    );
  }

  const { analyzed, unit } = props;
  if (analyzed.points.length === 0) {
    return (
      <Zone label="Result">
        <div className="hatch px-3 py-8 text-center">
          <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
            Not enough data for a power curve
          </p>
          <p className="t-annotation mt-1.5">
            Check mass and rollout, or the recording may be too short
          </p>
        </div>
      </Zone>
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
      <Zone label="Result" actions={<RunQualityBadge quality={analyzed.quality} />}>
        <div className="grid grid-cols-2">
          <div className="px-3 py-3">
            <Readout
              value={formatPower(peak.wheel_power_kw, unit, { unitSuffix: false })}
              unit={unit}
              label="Peak power"
              tone="procedure"
              note={formatPower(peak.wheel_power_kw, opp)}
            />
          </div>
          <div className="rule-l px-3 py-3">
            <Readout
              value={peakTorque.wheel_torque_nm.toFixed(0)}
              unit="Nm"
              label="Peak torque"
              note={`at ${peakTorque.rpm.toFixed(0)} RPM`}
            />
          </div>
        </div>
      </Zone>

      <AccelTimesCard accel={analyzed.accel_times} />

      <PlanView
        label="Wheel power vs RPM"
        scale={`${analyzed.rpm_min.toFixed(0)}-${analyzed.rpm_max.toFixed(0)} RPM, 100 RPM bins, ${unit}`}
      >
        <PowerCurveChart
          series={[{ label: 'Power', points: analyzed.points }]}
          mode="power"
          unit={unit}
        />
      </PlanView>

      <NotesBox>{WHEEL_POWER_CAVEAT}</NotesBox>

      <RevisionBar
        entries={[
          { label: 'Pipeline', value: `v${analyzed.pipeline_version}` },
          { label: 'Bins', value: analyzed.points.length },
          { label: 'Fix rate', value: `${analyzed.quality.avg_fix_rate_hz.toFixed(1)} Hz` },
          { label: 'Derived', value: 'In memory, nothing saved' },
        ]}
      />
    </div>
  );
}
