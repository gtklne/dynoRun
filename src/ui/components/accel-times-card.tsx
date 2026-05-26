import type { AccelTimes, AccelInterval } from '@/analysis/accel-times';

interface AccelTimesCardProps {
  accel: AccelTimes;
}

const ZERO_TO_HUNDRED_LABEL = '0–100 km/h';

function isZeroToHundred(interval: AccelInterval): boolean {
  return interval.from_kmh === 0 && interval.to_kmh === 100;
}

export function AccelTimesCard({ accel }: AccelTimesCardProps) {
  const hero = accel.intervals.find(isZeroToHundred) ?? null;
  const others = accel.intervals.filter((i) => !isZeroToHundred(i));
  const hasContent = accel.intervals.length > 0 || accel.quarter_mile != null;

  if (!hasContent) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-zinc-500 text-xs uppercase tracking-wider">Acceleration</h2>
        <span className="text-zinc-600 text-xs tabular-nums">
          peak {accel.peak_speed_kmh.toFixed(0)} km/h
        </span>
      </div>

      {hero && (
        <div>
          <p className="tabular-nums">
            <span className="text-3xl font-bold text-amber-400">{hero.elapsed_s.toFixed(1)}</span>
            <span className="text-sm text-zinc-400 ml-1">s</span>
          </p>
          <p className="text-zinc-500 text-xs mt-0.5">{ZERO_TO_HUNDRED_LABEL}</p>
        </div>
      )}

      {others.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {others.map((iv) => (
            <div key={iv.label} className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
              <p className="tabular-nums">
                <span className="text-lg font-semibold text-zinc-100">{iv.elapsed_s.toFixed(1)}</span>
                <span className="text-[10px] text-zinc-500 ml-1">s</span>
              </p>
              <p className="text-zinc-500 text-[10px] mt-0.5 truncate">{iv.label}</p>
            </div>
          ))}
        </div>
      )}

      {accel.quarter_mile && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-baseline justify-between">
          <div>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Quarter mile</p>
            <p className="tabular-nums mt-0.5">
              <span className="text-xl font-bold text-zinc-100">
                {accel.quarter_mile.elapsed_s.toFixed(1)}
              </span>
              <span className="text-xs text-zinc-400 ml-1">s</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Trap speed</p>
            <p className="tabular-nums mt-0.5">
              <span className="text-xl font-bold text-zinc-100">
                {accel.quarter_mile.trap_speed_kmh.toFixed(0)}
              </span>
              <span className="text-xs text-zinc-400 ml-1">km/h</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
