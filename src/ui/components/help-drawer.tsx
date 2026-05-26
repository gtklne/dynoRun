import { useEffect, useState, type ReactNode } from 'react';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

function SectionHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">
        {kicker}
      </p>
      <h2 className="text-zinc-100 text-lg font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

function StepCard({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <span className="bg-amber-500/15 text-amber-400 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0">
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-zinc-100 text-sm font-semibold">{title}</p>
        <p className="text-zinc-400 text-xs mt-0.5 leading-snug">{body}</p>
      </div>
    </li>
  );
}

function GlossaryItem({ term, definition }: { term: string; definition: ReactNode }) {
  return (
    <li className="space-y-0.5">
      <p className="text-zinc-100 text-sm font-medium">{term}</p>
      <p className="text-zinc-400 text-xs leading-snug">{definition}</p>
    </li>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <section className="space-y-2">{children}</section>;
}

function Body({ children }: { children: ReactNode }) {
  return <p className="text-zinc-300 text-sm leading-relaxed">{children}</p>;
}

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted && !open) return null;

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Help"
    >
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        onTransitionEnd={() => {
          if (!open) setMounted(false);
        }}
        className={`absolute inset-y-0 right-0 w-full sm:w-[480px] bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="pt-safe shrink-0 px-5 py-4 border-b border-zinc-800/60 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-widest">
              Help
            </p>
            <h1 className="text-zinc-100 text-xl font-bold tracking-tight">
              Getting started
            </h1>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <Section>
            <SectionHeader kicker="Welcome" title="What is DynoRun?" />
            <Body>
              DynoRun derives your car&apos;s wheel-power curve from GPS acceleration
              data. No dyno required — just drive.
            </Body>
          </Section>

          <Section>
            <SectionHeader kicker="The flow" title="Three steps" />
            <ol className="space-y-2">
              <StepCard
                index={1}
                title="Add vehicle"
                body="Mass matters — physics is F = m·a."
              />
              <StepCard
                index={2}
                title="Calibrate a gear"
                body="Drive at a known RPM to capture your speed-to-RPM ratio."
              />
              <StepCard
                index={3}
                title="Drive & record"
                body="The app derives your power curve from GPS acceleration."
              />
            </ol>
          </Section>

          <Section>
            <SectionHeader kicker="Calibration" title="Why you do it once per gear" />
            <Body>
              The app uses a steady-state RPM-to-speed reading to figure out your gear
              ratio and tire size in a single number (rollout). Pick a flat road, hold a
              known RPM in your target gear for about 5 seconds, confirm.
            </Body>
          </Section>

          <Section>
            <SectionHeader kicker="A good run" title="What to look for" />
            <Body>
              GPS accuracy matters. Wait for the GPS quality indicator before starting.
              Pick a straight road with little traffic. Hold a steady throttle from your
              starting speed to wherever the engine maxes out. The app stops
              automatically when you lift.
            </Body>
          </Section>

          <Section>
            <SectionHeader kicker="The numbers" title="Glossary" />
            <ul className="space-y-3">
              <GlossaryItem
                term="Peak power (kW / hp)"
                definition="Biggest number on your curve, at the RPM where the engine pulls hardest."
              />
              <GlossaryItem
                term="0–100 km/h"
                definition="Only shown if your run started near a stop."
              />
              <GlossaryItem
                term="Quality score"
                definition="Composite of GPS sample rate, gaps, noise, and accel realism. Below 50 means the curve is probably unreliable."
              />
            </ul>
          </Section>

          <Section>
            <SectionHeader kicker="Sharing" title="Public links" />
            <Body>
              Tap Share on a run review to make a public link (no login needed to view)
              or to share a card image.
            </Body>
          </Section>

          <Section>
            <SectionHeader kicker="Tips" title="Get the cleanest curve" />
            <ul className="text-zinc-300 text-sm space-y-1.5 list-disc list-inside marker:text-amber-400">
              <li>Clear-sky GPS — open road, no tunnels or canyons.</li>
              <li>One gear at a time.</li>
              <li>Smooth throttle from start to redline.</li>
              <li>Avoid wheelspin — it lies to the accelerometer.</li>
            </ul>
          </Section>

          <Section>
            <SectionHeader kicker="Privacy" title="Where your data lives" />
            <Body>
              Data is stored on wasgoht.ch and tied to your account. Public share links
              are only created when you explicitly opt in.
            </Body>
          </Section>
        </div>

        <footer className="pb-safe shrink-0 px-5 py-3 border-t border-zinc-800/60 text-center">
          <p className="text-zinc-500 text-xs">
            v0.5 ·{' '}
            <a
              href="https://wasgoht.ch"
              className="text-zinc-400 hover:text-amber-400 transition-colors"
            >
              wasgoht.ch
            </a>
          </p>
        </footer>
      </aside>
    </div>
  );
}

interface HelpButtonProps {
  className?: string;
}

export function HelpButton({ className }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Help"
        onClick={() => setOpen(true)}
        className={
          className ??
          'w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 flex items-center justify-center transition-colors'
        }
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      <HelpDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
