import { PlateButton, PlateSegmented } from '@/ui/plate';
import type { GripPlayback } from './use-grip-playback';

const SPEEDS: string[] = ['0.5', '1', '2', '4'];

interface TransportBarProps {
  playback: GripPlayback;
  lapLength: number;
  /** current / total lap seconds */
  tCur: number;
  tTot: number;
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" aria-hidden="true">
      <path d="M4 2.5 13 8l-9 5.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3.5" y="2.5" width="3.5" height="11" fill="currentColor" stroke="none" />
      <rect x="9" y="2.5" width="3.5" height="11" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Lap playback: run the profile past the cursor rather than dragging it. */
export function TransportBar({ playback, lapLength, tCur, tTot }: TransportBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <PlateButton
        variant={playback.playing ? 'solid' : 'outline'}
        onClick={playback.toggle}
        aria-label={playback.playing ? 'Pause' : 'Play'}
        className="shrink-0"
      >
        {playback.playing ? <PauseIcon /> : <PlayIcon />}
        {playback.playing ? 'Pause' : 'Play'}
      </PlateButton>

      <div className="min-w-[12rem] flex-1">
        <input
          type="range"
          min={0}
          max={lapLength - 1}
          step={1}
          value={playback.cursor}
          aria-label="Lap position"
          onChange={(e) => playback.scrub(+e.target.value)}
          className="w-full"
        />
        <div className="mt-1 flex justify-between">
          <span className="t-annotation">{tCur.toFixed(2)} s</span>
          <span className="t-annotation">of {tTot.toFixed(2)} s</span>
        </div>
      </div>

      <PlateSegmented
        label="Playback speed"
        value={String(playback.speed)}
        options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        onChange={(v) => playback.setSpeed(Number(v))}
        className="shrink-0"
      />
    </div>
  );
}
