import type { GripPlayback } from './use-grip-playback';

const SPEEDS = [0.5, 1, 2, 4];

interface TransportBarProps {
  playback: GripPlayback;
  lapLength: number;
  /** current / total lap seconds */
  tCur: number;
  tTot: number;
}

export function TransportBar({ playback, lapLength, tCur, tTot }: TransportBarProps) {
  return (
    <div className="flex items-center gap-3.5">
      <button
        type="button"
        onClick={playback.toggle}
        aria-label={playback.playing ? 'Pause' : 'Play'}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-600 text-base text-white transition-colors hover:bg-sky-500"
      >
        {playback.playing ? '❚❚' : '▶'}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={lapLength - 1}
          step={1}
          value={playback.cursor}
          onChange={(e) => playback.scrub(+e.target.value)}
          className="w-full accent-sky-500"
        />
        <div className="mt-0.5 flex justify-between font-mono text-[11px] text-zinc-500 tabular-nums">
          <span>{tCur.toFixed(2)}s</span>
          <span>{tTot.toFixed(2)}s</span>
        </div>
      </div>
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => playback.setSpeed(s)}
            className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
              playback.speed === s
                ? 'border-sky-500 text-zinc-100'
                : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
