const RATES = [0.25, 0.5, 1, 2, 4, 8];

function formatClock(ms: number): string {
  const total_s = Math.max(0, ms) / 1000;
  const m = Math.floor(total_s / 60);
  const s = total_s - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

interface ReplayTransportProps {
  t_ms: number;
  duration_ms: number;
  rate: number;
  autoStopTMs: number | null;
  onSetRate: (rate: number) => void;
  onRestart: () => void;
  onScrubStart: () => void;
  onScrub: (t_ms: number) => void;
  onScrubEnd: () => void;
}

export function ReplayTransport({
  t_ms,
  duration_ms,
  rate,
  autoStopTMs,
  onSetRate,
  onRestart,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: ReplayTransportProps) {
  const max = Math.max(1, duration_ms);
  const autoStopPct = autoStopTMs != null && duration_ms > 0
    ? Math.min(100, (autoStopTMs / duration_ms) * 100)
    : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      {/* Scrubber */}
      <div className="relative pt-1">
        {autoStopPct != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500/70 pointer-events-none"
            style={{ left: `${autoStopPct}%` }}
            title="Auto-stop point"
            aria-hidden
          />
        )}
        <input
          type="range"
          min={0}
          max={max}
          step={10}
          value={Math.min(t_ms, max)}
          onPointerDown={onScrubStart}
          onPointerUp={onScrubEnd}
          onInput={(e) => onScrub(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label="Seek"
          className="w-full accent-amber-500 cursor-pointer"
        />
      </div>
      <div className="flex items-center justify-between text-xs tabular-nums text-zinc-500">
        <span>{formatClock(t_ms)}</span>
        {autoStopTMs != null && (
          <span className="text-red-400/80">auto-stop {formatClock(autoStopTMs)}</span>
        )}
        <span>{formatClock(duration_ms)}</span>
      </div>

      {/* Rate + restart */}
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Playback speed" className="inline-flex flex-1 bg-zinc-800 rounded-xl p-1 border border-zinc-700">
          {RATES.map((r) => {
            const selected = Math.abs(r - rate) < 1e-6;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={selected}
                onClick={() => onSetRate(r)}
                className={`flex-1 px-1 py-1.5 rounded-lg text-[11px] font-semibold tabular-nums transition-colors ${
                  selected ? 'bg-amber-500 text-zinc-950 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {r}×
              </button>
            );
          })}
        </div>
        <button
          onClick={onRestart}
          className="shrink-0 flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 rounded-xl transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Restart
        </button>
      </div>
    </div>
  );
}
