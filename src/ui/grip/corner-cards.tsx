import type { GripCorner, GripLap } from '@/analysis/grip/types';
import type { GripSettings } from '@/analysis/grip/settings';
import type { GripMetricMode } from './metric-mode';
import { rateColor, scoreColor } from './colors';

export interface CornerLiveStats {
  /** apex demand in g against the active metric */
  apexG: number;
  /** robust peak demand in g through the corner */
  peakG: number;
}

interface CornerCardsProps {
  lap: GripLap;
  liveStats: Map<number, CornerLiveStats>;
  /** best apex demand per corner number across ALL laps (same metric) */
  bestApexG: Map<number, number>;
  mode: GripMetricMode;
  settings: Pick<GripSettings, 'spareScore' | 'rateFS' | 'anchorG'>;
  activeCorner: number | null;
  onSelect: (corner: GripCorner) => void;
}

const score = (g: number) => Math.round(g * 100);

export function CornerCards({ lap, liveStats, bestApexG, mode, settings, activeCorner, onSelect }: CornerCardsProps) {
  const label = mode === 'load' ? 'apex load' : 'apex grip';
  // corners with the biggest proven gap to the rider's own best on other laps
  const gaps = lap.corners
    .map((c) => ({ c, gap: score(bestApexG.get(c.n) ?? 0) - score(liveStats.get(c.n)?.apexG ?? 0) }))
    .filter((x) => x.gap >= settings.spareScore)
    .sort((a, b) => b.gap - a.gap);
  const opportunities = gaps.slice(0, 3).map((x) => `T${x.c.n}`).join(', ');

  return (
    <section>
      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Corner analysis</h2>
          <p className="text-xs text-zinc-500">
            {lap.corners.length ? (
              <>
                {lap.corners.length} corners · score = {label} ×100 (100 ≈ 1 g)
                {opportunities && (
                  <>
                    {' '}· below your best at <b style={{ color: scoreColor(0, 1) }}>{opportunities}</b>
                  </>
                )}
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
          const apexG = stats?.apexG ?? 0;
          const peakG = stats?.peakG ?? 0;
          const best = bestApexG.get(c.n) ?? 0;
          const gap = score(best) - score(apexG);
          const spare = gap >= settings.spareScore;
          const isBest = best > 0 && score(apexG) >= score(best);
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
              {spare && (
                <span className="absolute right-3 top-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: scoreColor(0, 1) }}>
                  ▲ {gap} below best
                </span>
              )}
              {isBest && !spare && (
                <span className="absolute right-3 top-2.5 text-[10px] font-bold uppercase tracking-wide text-sky-400">
                  ★ session best
                </span>
              )}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-lg font-mono text-xs font-bold text-zinc-950"
                  style={{ background: scoreColor(apexG, settings.anchorG) }}
                >
                  {c.n}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Turn {c.n} · {c.dir === 'L' ? 'Left' : 'Right'}
                </span>
              </div>
              <div className="font-mono text-[26px] leading-none" style={{ color: scoreColor(apexG, settings.anchorG) }}>
                {score(apexG)}
                <span className="text-[13px] text-zinc-500"> {label}</span>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">
                peak {score(peakG)} through corner{best > 0 && <> · best here {score(best)}</>}
              </div>
              <div className="relative mt-2.5 h-[7px] overflow-hidden rounded border border-zinc-800 bg-zinc-950">
                <i
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${Math.min(100, (apexG / settings.anchorG) * 100)}%`, background: scoreColor(apexG, settings.anchorG) }}
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
