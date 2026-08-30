import type { GripLap } from '@/analysis/grip/types';
import { formatLapTime } from './format-lap';

interface LapTabsProps {
  laps: GripLap[];
  bestNum: number;
  activeNum: number;
  onSelect: (lap: GripLap) => void;
}

/**
 * One ruled strip, hairline dividers, the selected lap inverted to solid ink.
 * The best lap is called out in words rather than by a glyph, so it survives a
 * screen reader and a monochrome print alike.
 */
export function LapTabs({ laps, bestNum, activeNum, onSelect }: LapTabsProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Lap"
      className="box-frame flex max-w-full overflow-x-auto"
      style={{ isolation: 'isolate' }}
    >
      {laps.map((lap, i) => {
        const active = lap.num === activeNum;
        const best = lap.num === bestNum;
        return (
          <button
            key={lap.num}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Lap ${lap.num}, ${formatLapTime(lap.time)}${best ? ', best' : ''}`}
            data-active={active}
            onClick={() => onSelect(lap)}
            className={`ctl shrink-0 flex-col items-start gap-0.5 border-0 px-3 py-1.5 ${i > 0 ? 'rule-l' : ''}`}
            style={{ minHeight: 48 }}
          >
            <span className="flex items-baseline gap-1.5">
              <span>Lap {lap.num}</span>
              {best && (
                <span style={{ fontSize: '0.6875rem', fontStretch: '75%', opacity: 0.72 }}>best</span>
              )}
            </span>
            <span
              style={{
                fontStretch: '100%',
                fontWeight: 550,
                fontSize: '0.8125rem',
                letterSpacing: 'normal',
                textTransform: 'none',
              }}
            >
              {formatLapTime(lap.time)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
