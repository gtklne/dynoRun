// Shared brand marks for the umbrella suite ("wasgoht") and its tools.
// Replaces the wordmark that was inlined in app-shell, demo-run-screen, and
// login-screen. DynoRun keeps amber; Grip keeps blue; the suite is neutral with
// a multi-accent mark (mirrors the palette used across the tools).

const GRIP_BLUE = '#4c95ec';

interface WordmarkProps {
  brand?: 'suite' | 'dynorun' | 'grip';
  className?: string;
}

export function Wordmark({ brand = 'suite', className = 'font-bold text-lg tracking-tight' }: WordmarkProps) {
  if (brand === 'dynorun') {
    return (
      <span className={className}>
        <span className="text-amber-400">dyno</span>
        <span className="text-zinc-100">Run</span>
      </span>
    );
  }
  if (brand === 'grip') {
    return (
      <span className={className}>
        <span style={{ color: GRIP_BLUE }}>Grip</span>
        <span className="text-zinc-100"> Utilization</span>
      </span>
    );
  }
  return (
    <span className={className}>
      <span className="text-zinc-100">wasgoht</span>
    </span>
  );
}

/** The suite mark: a small conic-gradient tile (same identity as the launcher). */
export function SuiteMark({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'conic-gradient(from 210deg, #0ca30c, #fab219, #d03b3b, #3987e5, #0ca30c)',
        boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(size * 0.16))}px #09090b, 0 0 0 1px #3a3a40`,
        display: 'inline-block',
        flex: '0 0 auto',
      }}
    />
  );
}
