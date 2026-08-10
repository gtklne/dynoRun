import { type ReactNode } from 'react';
import { BrandLogo } from '@/ui/components/brand-logo';
import { SuiteMark, Wordmark } from '@/ui/components/brand-wordmark';
import { GRIP_BLUE } from '@/ui/grip/colors';

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

/**
 * The public landing page. Prerendered to a script-free dist/landing.html at
 * build time (src/prerender/landing-document.tsx), and still rendered by the SPA
 * for anonymous visitors who reach "/" client-side (dev, or a stale session
 * cookie in prod). Both paths must produce the same markup, so this component
 * stays free of hooks and of react-router <Link>. Every link is a plain <a>,
 * which is also the only kind that works on a page that ships no JS. The title
 * lives in the two documents' <head>, not in an effect, for the same reason.
 */
export function LandingScreen() {
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
          <a
            href="/login"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400 active:bg-amber-600"
          >
            Sign in
          </a>
        </header>

        {/* hero */}
        <section className="flex flex-col items-start gap-6 pt-14 pb-16 lg:pt-24">
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Your phone is the
            <span className="text-amber-400"> dyno</span>.
            <br className="hidden sm:block" />
            Your data is the
            <span style={{ color: GRIP_BLUE }}> edge</span>.
          </h1>
          <p className="max-w-xl text-base leading-7 text-zinc-400">
            wasgoht is a small suite of motorsport telemetry tools: a GPS virtual dyno and a
            track-session grip analyzer. One login, both tools, all in your browser.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="/login"
              className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400 active:bg-amber-600"
            >
              Sign in to get started
            </a>
            <a
              href="/demo"
              className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
            >
              See an example run
            </a>
          </div>
        </section>

        {/* tools */}
        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          <ToolCard
            accent="#f59e0b"
            icon={<BrandLogo size={26} />}
            name="DynoRun"
            blurb="Drive one gear and the app derives your wheel-power and torque curves from GPS acceleration, with no rolling road required."
            points={['Power & torque from F = ma', 'Per-vehicle garage & run history', 'Compare runs and share results']}
            footer={
              <a href="/login" className="text-sm font-semibold text-amber-400 hover:text-amber-300">
                Open DynoRun →
              </a>
            }
          />
          <ToolCard
            accent={GRIP_BLUE}
            icon={<GripGlyph size={26} />}
            name="Grip Utilization"
            blurb="Load a RaceBox track session and see how much of your traction circle you actually used, corner by corner, entirely in the browser."
            points={['Traction-circle & grip analysis', 'Per-corner utilization breakdown', 'Sessions saved to your account']}
            footer={
              <a href="/grip" className="text-sm font-semibold hover:opacity-80" style={{ color: GRIP_BLUE }}>
                Open Grip →
              </a>
            }
          />
        </section>

        {/* footer */}
        <footer className="mt-auto border-t border-zinc-900 py-6 text-xs text-zinc-600">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex gap-4">
              <a href="/privacy" className="hover:text-zinc-400">Privacy Policy</a>
              <a href="/imprint" className="hover:text-zinc-400">Imprint</a>
            </span>
          </div>
          {/* Followable outbound link, robots.txt only allows crawling of "/", so this is the
              one page where the link carries weight. Never add rel="nofollow" here. */}
          <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-zinc-900 pt-4">
            <span className="font-medium text-zinc-500">Our friends:</span>
            <a
              href="https://partynado.com"
              target="_blank"
              rel="noopener"
              className="font-semibold text-zinc-300 transition-colors hover:text-white"
            >
              Partynado
            </a>
            <span>Find your party in Switzerland &amp; Germany.</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
