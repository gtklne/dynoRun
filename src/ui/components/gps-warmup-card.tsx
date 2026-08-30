import { Advisory, Na, PlateGauge, Zone } from '@/ui/plate';

export const GPS_ACCURACY_GOOD_M = 10;
export const GPS_REQUIRED_GOOD_MS = 2_000;
export const GPS_POOR_WARN_MS = 15_000;

export interface GpsWarmupTelemetry {
  accuracy_m: number | null;
  quality: number;
  fix_rate_hz: number;
}

interface GpsWarmupCardProps {
  telemetry: GpsWarmupTelemetry | null;
  currentSpeedKmh: number | null;
  warmupStartedAt: number;
  goodSince: number | null;
  now: number;
  /** Suffix in the poor-GPS warning: "dyno data" or "calibration". */
  poorOutcome?: string;
  goodAccuracyM?: number;
  requiredGoodMs?: number;
  poorWarnMs?: number;
}

/**
 * A reading is either inside the tolerance or outside it, and that is the only
 * distinction worth spending ink on. Caution marks a value that will spoil the
 * measurement; everything acceptable stays in plain ink, so the one number the
 * driver has to act on is the one that is not black.
 */
function toneStyle(bad: boolean) {
  return bad ? { color: 'var(--color-caution)' } : undefined;
}

function Row({
  label,
  value,
  unit,
  bad = false,
}: {
  label: string;
  value: string | null;
  unit: string;
  bad?: boolean;
}) {
  return (
    <div className="rule-t flex items-baseline justify-between px-3 py-1.5 first:border-t-0">
      <dt className="t-annotation">{label}</dt>
      <dd className="t-data text-sm" style={toneStyle(bad)}>
        {value === null ? (
          <Na />
        ) : (
          <>
            {value}
            <span className="t-annotation ml-1">{unit}</span>
          </>
        )}
      </dd>
    </div>
  );
}

export function GpsWarmupCard({
  telemetry,
  currentSpeedKmh,
  warmupStartedAt,
  goodSince,
  now,
  poorOutcome = 'dyno data',
  goodAccuracyM = GPS_ACCURACY_GOOD_M,
  requiredGoodMs = GPS_REQUIRED_GOOD_MS,
  poorWarnMs = GPS_POOR_WARN_MS,
}: GpsWarmupCardProps) {
  const noFixYet = telemetry === null;
  const goodFor_ms = goodSince != null ? now - goodSince : 0;
  const warmupFor_ms = now - warmupStartedAt;
  const locked = goodFor_ms >= requiredGoodMs;
  const showPoorWarning = !locked && warmupFor_ms > poorWarnMs;

  const status = noFixYet
    ? 'Waiting for first fix'
    : locked
      ? 'Locked'
      : showPoorWarning
        ? 'Poor conditions'
        : 'Acquiring lock';

  const accuracy = telemetry?.accuracy_m ?? null;

  return (
    <div className="plate-stack">
      {showPoorWarning && (
        <Advisory>
          Accuracy has stayed worse than {goodAccuracyM} m for over{' '}
          {Math.floor(poorWarnMs / 1000)} s. Moving to open sky usually helps. Starting now will
          produce unreliable {poorOutcome}.
        </Advisory>
      )}

      <Zone label="GPS signal" note={status} flush>
        {/* Kept on screen after it fills rather than swapped out: green IS the
            reading the driver is waiting for, and a gauge that vanishes at the
            moment it succeeds never gets to say so. */}
        <div className="rule-b block-body">
          <PlateGauge
            label="Lock progress"
            value={Math.min(goodFor_ms, requiredGoodMs) / 1000}
            max={requiredGoodMs / 1000}
            unit="s"
            reached={locked}
            blocked={showPoorWarning}
            note={
              locked
                ? undefined
                : `Need ${(requiredGoodMs / 1000).toFixed(0)} s of accuracy at or under ${goodAccuracyM} m`
            }
          />
        </div>

        <dl>
          <Row
            label="Accuracy"
            value={accuracy != null ? accuracy.toFixed(1) : null}
            unit="m"
            bad={accuracy != null && accuracy > goodAccuracyM}
          />
          <Row
            label="Signal quality"
            value={telemetry ? String(Math.round(telemetry.quality * 100)) : null}
            unit="%"
            bad={telemetry != null && telemetry.quality < 0.4}
          />
          <Row
            label="Fix rate"
            value={telemetry?.fix_rate_hz != null ? telemetry.fix_rate_hz.toFixed(1) : null}
            unit="Hz"
          />
          <Row
            label="Current speed"
            value={currentSpeedKmh != null ? currentSpeedKmh.toFixed(1) : null}
            unit="km/h"
          />
        </dl>
      </Zone>
    </div>
  );
}

export function isGpsLocked(goodSince: number | null, now: number, requiredGoodMs = GPS_REQUIRED_GOOD_MS): boolean {
  return goodSince != null && now - goodSince >= requiredGoodMs;
}

export function isGpsPoor(
  goodSince: number | null,
  warmupStartedAt: number,
  now: number,
  requiredGoodMs = GPS_REQUIRED_GOOD_MS,
  poorWarnMs = GPS_POOR_WARN_MS,
): boolean {
  const locked = isGpsLocked(goodSince, now, requiredGoodMs);
  return !locked && now - warmupStartedAt > poorWarnMs;
}
