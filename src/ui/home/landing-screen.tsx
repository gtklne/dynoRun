import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/ui/components/brand-logo';
import { SuiteMark, Wordmark } from '@/ui/components/brand-wordmark';

const GRIP_BLUE = '#4c95ec';

function GripGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={GRIP_BLUE} strokeWidth="2" aria-hidden="true">
      <circle cx="16" cy="16" r="12" opacity="0.45" />
      <circle cx="16" cy="16" r="7" />
      <line x1="16" y1="3" x2="16" y2="29" opacity="0.3" />
      <line x1="3" y1="16" x2="29" y2="16" opacity="0.3" />
      <circle cx="20.5" cy="11.5" r="2.4" fill={GRIP_BLUE} stroke="none" />
    </svg>
  );
}

function ToolCard({
  accent, icon, name, blurb, points, footer,
}: { accent: string; icon: ReactNode; name: string; blurb: string; points: string[]; footer: ReactNode }) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-zinc-100">{name}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{blurb}</p>
      <ul className="mt-4 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-zinc-300">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-5">{footer}</div>
    </div>
  );
}

export function LandingScreen() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'wasgoht — motorsport telemetry';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ambient accent glows (amber = DynoRun, blue = Grip) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 460px at 12% -8%, rgba(245,158,11,0.10), transparent 70%),' +
            'radial-gradient(820px 460px at 100% 4%, rgba(76,149,236,0.10), transparent 70%)',
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5">
        {/* header */}
        <header className="pt-safe flex items-center justify-between py-5">
          <span className="flex items-center gap-2.5">
            <SuiteMark size={26} />
            <Wordmark brand="suite" className="text-lg font-bold tracking-tight" />
          </span>
          <Link
            to="/login"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400 active:bg-amber-600"
          >
            Sign in
          </Link>
        </header>

        {/* hero */}
        <section className="flex flex-col items-start gap-6 pt-14 pb-16 lg:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Motorsport telemetry suite
          </span>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Your phone is the
            <span className="text-amber-400"> dyno</span>.
            <br className="hidden sm:block" />
            Your data is the
            <span style={{ color: GRIP_BLUE }}> edge</span>.
          </h1>
          <p className="max-w-xl text-base leading-7 text-zinc-400">
            wasgoht is a small suite of motorsport telemetry tools — a GPS virtual dyno and a
            track-session grip analyzer. One login, both tools, all in your browser.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              to="/login"
              className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400 active:bg-amber-600"
            >
              Sign in to get started
            </Link>
            <Link
              to="/demo"
              className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
            >
              See an example run
            </Link>
          </div>
        </section>

        {/* tools */}
        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          <ToolCard
            accent="#f59e0b"
            icon={<BrandLogo size={26} />}
            name="DynoRun"
            blurb="Drive one gear and the app derives your wheel-power and torque curves from GPS acceleration — no rolling road required."
            points={['Power & torque from F = ma', 'Per-vehicle garage & run history', 'Compare runs and share results']}
            footer={
              <Link to="/login" className="text-sm font-semibold text-amber-400 hover:text-amber-300">
                Open DynoRun →
              </Link>
            }
          />
          <ToolCard
            accent={GRIP_BLUE}
            icon={<GripGlyph size={26} />}
            name="Grip Utilization"
            blurb="Load a RaceBox track session and see how much of your traction circle you actually used, corner by corner — entirely in the browser."
            points={['Traction-circle & grip analysis', 'Per-corner utilization breakdown', 'Your CSV never leaves your device']}
            footer={
              <Link to="/grip" className="text-sm font-semibold hover:opacity-80" style={{ color: GRIP_BLUE }}>
                Open Grip →
              </Link>
            }
          />
        </section>

        {/* footer */}
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 py-6 text-xs text-zinc-600">
          <span>Built by Johannes Nothstein.</span>
          <span className="flex gap-4">
            <Link to="/privacy" className="hover:text-zinc-400">Privacy Policy</Link>
            <Link to="/imprint" className="hover:text-zinc-400">Imprint</Link>
          </span>
        </footer>
      </div>
    </div>
  );
}
