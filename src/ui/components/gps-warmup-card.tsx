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
  /** Suffix in the poor-GPS warning — "dyno data" or "calibration". */
  poorOutcome?: string;
  goodAccuracyM?: number;
  requiredGoodMs?: number;
  poorWarnMs?: number;
}

function accuracyColor(m: number | null, goodM: number): string {
  if (m === null) return 'text-zinc-500';
  if (m <= goodM) return 'text-emerald-400';
  if (m <= goodM * 2) return 'text-amber-400';
  return 'text-red-400';
}

function qualityColor(q: number): string {
  if (q >= 0.7) return 'text-emerald-400';
  if (q >= 0.4) return 'text-amber-400';
  return 'text-red-400';
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

  return (
    <div
      className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-colors ${
        locked ? 'border-emerald-800/40' : showPoorWarning ? 'border-red-800/50' : 'border-zinc-800'
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/60">
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            locked ? 'bg-emerald-400' : showPoorWarning ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
          }`}
        />
        <span
          className={`text-xs font-semibold uppercase tracking-widest ${
            locked ? 'text-emerald-400' : showPoorWarning ? 'text-red-400' : 'text-amber-400'
          }`}
        >
          {noFixYet ? 'Waiting for first fix' : locked ? 'GPS locked' : showPoorWarning ? 'Poor GPS conditions' : 'Acquiring GPS lock'}
        </span>
      </div>

      {showPoorWarning && (
        <div className="px-4 py-3 bg-red-950/30 border-b border-red-800/40">
          <p className="text-red-300 text-xs leading-relaxed">
            Accuracy has stayed worse than {goodAccuracyM} m for over {Math.floor(poorWarnMs / 1000)}s.
            Moving to open sky usually helps. Starting now will produce unreliable {poorOutcome}.
          </p>
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        <div className="flex items-baseline justify-between py-1 border-b border-zinc-800/60">
          <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Accuracy</span>
          <span className={`tabular-nums text-sm font-mono font-semibold ${accuracyColor(telemetry?.accuracy_m ?? null, goodAccuracyM)}`}>
            {telemetry?.accuracy_m != null ? telemetry.accuracy_m.toFixed(1) : '—'}
            <span className="text-zinc-500 text-xs font-normal ml-1">m</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between py-1 border-b border-zinc-800/60">
          <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Signal Quality</span>
          <span className={`tabular-nums text-sm font-mono font-semibold ${telemetry ? qualityColor(telemetry.quality) : 'text-zinc-500'}`}>
            {telemetry ? Math.round(telemetry.quality * 100) : '—'}
            <span className="text-zinc-500 text-xs font-normal ml-1">%</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between py-1 border-b border-zinc-800/60">
          <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Fix Rate</span>
          <span className="tabular-nums text-sm font-mono font-semibold text-zinc-100">
            {telemetry?.fix_rate_hz != null ? telemetry.fix_rate_hz.toFixed(1) : '—'}
            <span className="text-zinc-500 text-xs font-normal ml-1">Hz</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between py-1">
          <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">Current Speed</span>
          <span className="tabular-nums text-sm font-mono font-semibold text-zinc-100">
            {currentSpeedKmh != null ? currentSpeedKmh.toFixed(1) : '—'}
            <span className="text-zinc-500 text-xs font-normal ml-1">km/h</span>
          </span>
        </div>
      </div>

      {!locked && (
        <div className="px-4 pb-3 pt-1">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-zinc-600 text-[11px] uppercase tracking-wider">Lock progress</span>
            <span className="text-zinc-500 text-[11px] font-mono tabular-nums">
              {(goodFor_ms / 1000).toFixed(1)}s / {(requiredGoodMs / 1000).toFixed(0)}s
            </span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                goodSince ? 'bg-emerald-500' : showPoorWarning ? 'bg-red-600' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, (goodFor_ms / requiredGoodMs) * 100)}%` }}
            />
          </div>
          <p className="text-zinc-600 text-[11px] mt-1.5">
            Need {(requiredGoodMs / 1000).toFixed(0)}s of accuracy ≤ {goodAccuracyM} m
          </p>
        </div>
      )}
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
