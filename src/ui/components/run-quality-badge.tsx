import type { RunQuality, RunQualityFlag } from '@/analysis/run-quality';

const FLAG_LABELS: Record<RunQualityFlag, string> = {
  short_run: 'Run was too short for stable analysis',
  low_sample_density: 'GPS fix rate below 2 Hz',
  noisy_speed: 'Noisy speed signal',
  acceleration_spikes: 'Acceleration spikes (possible wheelspin or GPS glitch)',
  gps_dropouts: 'GPS dropouts (gaps > 500 ms)',
};

interface RunQualityBadgeProps {
  quality: RunQuality;
}

export function RunQualityBadge({ quality }: RunQualityBadgeProps) {
  const tone = quality.rating === 'good'
    ? { ring: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' }
    : quality.rating === 'fair'
      ? { ring: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' }
      : { ring: 'border-red-500/40 bg-red-500/10 text-red-300', dot: 'bg-red-400' };

  return (
    <details className="group inline-block">
      <summary
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${tone.ring} cursor-pointer select-none list-none text-xs font-medium tabular-nums`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
        <span className="capitalize">{quality.rating}</span>
        <span className="text-zinc-500">·</span>
        <span>{quality.score}/100</span>
        <span className="text-zinc-500 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="mt-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs space-y-2 max-w-xs">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-400">
          <span>Samples</span>
          <span className="text-zinc-200 tabular-nums text-right">{quality.sample_count}</span>
          <span>Duration</span>
          <span className="text-zinc-200 tabular-nums text-right">{quality.duration_s.toFixed(1)} s</span>
          <span>Fix rate</span>
          <span className="text-zinc-200 tabular-nums text-right">{quality.avg_fix_rate_hz.toFixed(1)} Hz</span>
          <span>Max gap</span>
          <span className="text-zinc-200 tabular-nums text-right">{Math.round(quality.max_gap_ms)} ms</span>
        </div>
        {quality.flags.length > 0 && (
          <ul className="space-y-1 pt-2 border-t border-zinc-800">
            {quality.flags.map((flag) => (
              <li key={flag} className="text-zinc-300 flex gap-2">
                <span className="text-red-400">!</span>
                <span>{FLAG_LABELS[flag]}</span>
              </li>
            ))}
          </ul>
        )}
        {quality.flags.length === 0 && (
          <p className="text-emerald-400 pt-2 border-t border-zinc-800">No quality issues detected.</p>
        )}
      </div>
    </details>
  );
}
