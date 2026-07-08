import type { GripCorner, GripLap } from '@/analysis/grip/types';
import type { GripSettings } from '@/analysis/grip/settings';
import type { GripMetricMode } from './metric-mode';
import { rateColor, utilColor } from './colors';

export interface CornerLiveStats {
  apexUtil: number;
  peakUtil: number;
}

interface CornerCardsProps {
  lap: GripLap;
  liveStats: Map<number, CornerLiveStats>;
  mode: GripMetricMode;
  settings: Pick<GripSettings, 'goHarder' | 'rateFS'>;
  activeCorner: number | null;
  onSelect: (corner: GripCorner) => void;
}

export function CornerCards({ lap, liveStats, mode, settings, activeCorner, onSelect }: CornerCardsProps) {
  const label = mode === 'load' ? 'apex load' : 'apex grip';
  const ranked = [...lap.corners].sort(
    (a, b) => (liveStats.get(a.n)?.apexUtil ?? 0) - (liveStats.get(b.n)?.apexUtil ?? 0),
  );
  const opportunities = ranked.slice(0, 3).map((c) => `T${c.n}`).join(', ');

  return (
    <section>
      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Corner analysis</h2>
          <p className="text-xs text-zinc-500">
            {lap.corners.length ? (
              <>
                {lap.corners.length} corners · most margin at{' '}
                <b style={{ color: utilColor(0) }}>{opportunities}</b> — colour = {label} used
                {mode === 'load' && ' (grip + load transfer)'}
              </>
            ) : (
              'No corners detected on this lap.'
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
        {lap.corners.map((c) => {
          const stats = liveStats.get(c.n);
          const apexUtil = stats?.apexUtil ?? 0;
          const peakUtil = stats?.peakUtil ?? 0;
          const margin = Math.max(0, 100 - apexUtil * 100);
          const goHarder = apexUtil < settings.goHarder / 100;
          const active = activeCorner === c.n;
          return (
            <button
              key={c.n}
              type="button"
              onClick={() => onSelect(c)}
              className={`relative overflow-hidden rounded-xl border bg-zinc-900 p-3 text-left transition-all hover:-translate-y-0.5 ${
                active ? 'border-sky-500 bg-[#12161c]' : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              {goHarder && (
                <span className="absolute right-3 top-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: utilColor(0) }}>
                  ▲ {Math.round(margin)}% spare
                </span>
              )}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-lg font-mono text-xs font-bold text-zinc-950"
                  style={{ background: utilColor(apexUtil) }}
                >
                  {c.n}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Turn {c.n} · {c.dir === 'L' ? 'Left' : 'Right'}
                </span>
              </div>
              <div className="font-mono text-[26px] leading-none" style={{ color: utilColor(apexUtil) }}>
                {Math.round(apexUtil * 100)}
                <span className="text-[13px] text-zinc-500">% {label}</span>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">peak {Math.round(peakUtil * 100)}% through corner</div>
              <div className="relative mt-2.5 h-[7px] overflow-hidden rounded border border-zinc-800 bg-zinc-950">
                <i
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${Math.min(100, apexUtil * 100)}%`, background: utilColor(apexUtil) }}
                />
              </div>
              <div className="mt-2.5 flex justify-between font-mono text-[11px] text-zinc-400">
                <span>{Math.round(c.minSpeed * 3.6)} km/h</span>
                <span>{Math.round(c.maxLean)}° lean</span>
                <span style={{ color: rateColor(Math.min(1, c.peakLoad / settings.rateFS)) }}>
                  ◍ {c.peakLoad.toFixed(1)} g/s
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
