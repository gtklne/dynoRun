import type { GripLap } from '@/analysis/grip/types';
import { formatLapTime } from './format-lap';

interface LapTabsProps {
  laps: GripLap[];
  bestNum: number;
  activeNum: number;
  onSelect: (lap: GripLap) => void;
}

export function LapTabs({ laps, bestNum, activeNum, onSelect }: LapTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {laps.map((lap) => {
        const active = lap.num === activeNum;
        const best = lap.num === bestNum;
        return (
          <button
            key={lap.num}
            type="button"
            onClick={() => onSelect(lap)}
            className={`flex min-w-[74px] flex-col items-start rounded-lg border px-3 py-1.5 text-left leading-tight transition-colors ${
              active
                ? 'border-sky-500 bg-[#14202e] text-zinc-100'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <b className={`text-xs ${best ? 'text-amber-400' : 'text-zinc-200'}`}>
              Lap {lap.num}
              {best && ' ★'}
            </b>
            <span className="font-mono text-[13px] tabular-nums">{formatLapTime(lap.time)}</span>
          </button>
        );
      })}
    </div>
  );
}
