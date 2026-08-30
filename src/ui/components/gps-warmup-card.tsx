import { Advisory, Na, Zone } from '@/ui/plate';

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
    <div className="rule-t flex items-baseline justify-between px-3 py-2 first:border-t-0">
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
  const progress = Math.min(100, (goodFor_ms / requiredGoodMs) * 100);

  return (
    <div className="space-y-2">
      {showPoorWarning && (
        <Advisory>
          Accuracy has stayed worse than {goodAccuracyM} m for over{' '}
          {Math.floor(poorWarnMs / 1000)} s. Moving to open sky usually helps. Starting now will
          produce unreliable {poorOutcome}.
        </Advisory>
      )}

      <Zone label="GPS signal" note={status}>
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

        {!locked && (
          <div className="rule-t px-3 py-2.5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="t-annotation">Lock progress</span>
              <span className="t-data text-xs">
                {(goodFor_ms / 1000).toFixed(1)} s / {(requiredGoodMs / 1000).toFixed(0)} s
              </span>
            </div>
            <div
              className="h-2.5 w-full"
              role="progressbar"
              aria-label="GPS lock progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              style={{ border: 'var(--rule-hair) solid var(--color-rule)' }}
            >
              {/* Scaled rather than width-animated: a width transition on a
                  bar that updates four times a second thrashes layout. */}
              <div
                className="h-full w-full origin-left"
                style={{
                  transform: `scaleX(${progress / 100})`,
                  background: showPoorWarning ? 'var(--color-caution)' : 'var(--color-ink)',
                  transition: 'transform 300ms var(--ease-plate)',
                }}
              />
            </div>
            <p className="t-annotation mt-1.5">
              Need {(requiredGoodMs / 1000).toFixed(0)} s of accuracy at or under {goodAccuracyM} m
            </p>
          </div>
        )}
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
