import { PlateButton, PlateSegmented } from '@/ui/plate';

const RATES = [0.25, 0.5, 1, 2, 4, 8];

const RATE_OPTIONS = RATES.map((r) => ({ value: String(r), label: `${r}×` }));

function formatClock(ms: number): string {
  const total_s = Math.max(0, ms) / 1000;
  const m = Math.floor(total_s / 60);
  const s = total_s - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function RestartIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <polyline points="2 4 2 10 8 10" />
      <path d="M3.5 15a9 9 0 1 0 2.2-9.4L2 10" />
    </svg>
  );
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
  // The nearest rate, so a value the player clamped to still lights a cell.
  const selectedRate = RATES.reduce((best, r) =>
    Math.abs(r - rate) < Math.abs(best - rate) ? r : best,
  RATES[0]);

  return (
    <section className="box-frame" aria-label="Replay transport">
      <div className="rule-b px-3 py-3">
        {/* The native range keeps every pointer and keyboard behaviour, and the
            plate's ink drives its own filled track, so the control is the
            platform's rather than a div pretending to be one. */}
        <div className="relative">
          {autoStopPct != null && (
            <div
              className="pointer-events-none absolute -top-1 bottom-0 w-px"
              style={{ left: `${autoStopPct}%`, background: 'var(--color-caution)' }}
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
            className="w-full cursor-pointer"
            style={{ accentColor: 'var(--color-ink)' }}
          />
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <span className="t-data text-xs">{formatClock(t_ms)}</span>
          {autoStopTMs != null && (
            <span className="t-annotation" style={{ color: 'var(--color-caution)' }}>
              auto-stop {formatClock(autoStopTMs)}
            </span>
          )}
          <span className="t-data text-xs">{formatClock(duration_ms)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <PlateSegmented
          label="Playback speed"
          value={String(selectedRate)}
          options={RATE_OPTIONS}
          onChange={(v) => onSetRate(Number(v))}
        />
        <PlateButton onClick={onRestart}>
          <RestartIcon />
          Restart
        </PlateButton>
      </div>
    </section>
  );
}
