import { useEffect, useState, type ReactNode } from 'react';
import { NotesBox, PlateButton, Zone } from '@/ui/plate';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <line x1="19" y1="5" x2="5" y2="19" />
      <line x1="5" y1="5" x2="19" y2="19" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.2 9.2a2.9 2.9 0 0 1 5.6 1c0 2-2.8 2.7-2.8 2.7" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  );
}

/** A numbered procedure step: the index is a ruled cell, never a filled pill. */
function Step({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <li className="rule-t flex items-start gap-3 px-3 py-2.5 first:border-t-0">
      <span
        aria-hidden="true"
        className="t-data flex h-6 w-6 shrink-0 items-center justify-center text-xs"
        style={{ border: 'var(--rule-hair) solid var(--color-rule)' }}
      >
        {index}
      </span>
      <div className="min-w-0">
        <p className="t-data text-sm">{title}</p>
        <p className="t-body mt-0.5 text-[0.8125rem] leading-6">{body}</p>
      </div>
    </li>
  );
}

function GlossaryItem({ term, definition }: { term: string; definition: ReactNode }) {
  return (
    <div className="rule-t px-3 py-2.5 first:border-t-0">
      <dt className="t-data text-sm">{term}</dt>
      <dd className="t-body mt-0.5 text-[0.8125rem] leading-6">{definition}</dd>
    </div>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <p className="t-body px-3 py-2.5 text-[0.8125rem] leading-6">{children}</p>;
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
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Help">
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className={`absolute inset-0 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'var(--color-terrain)', opacity: open ? 0.55 : 0 }}
      />
      <aside
        onTransitionEnd={() => {
          if (!open) setMounted(false);
        }}
        className={`absolute inset-y-0 right-0 flex w-full flex-col transition-transform duration-200 ease-out sm:w-[480px] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          background: 'var(--color-sheet)',
          borderLeft: 'var(--rule-section) solid var(--color-ink)',
        }}
      >
        <header className="rule-b pt-safe flex shrink-0 items-center justify-between px-4 py-3">
          <h1 className="t-plate-title">Getting started</h1>
          <PlateButton
            aria-label="Close"
            onClick={onClose}
            className="px-2"
            style={{ minHeight: 40 }}
          >
            <CloseIcon />
          </PlateButton>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          <Zone label="What is DynoRun?">
            <Body>
              DynoRun derives your car&apos;s wheel-power curve from GPS acceleration data. No dyno
              required, just drive.
            </Body>
          </Zone>

          <Zone label="Three steps">
            <ol>
              <Step index={1} title="Add vehicle" body="Mass matters, physics is F = m·a." />
              <Step
                index={2}
                title="Calibrate a gear"
                body="Drive at a known RPM to capture your speed-to-RPM ratio."
              />
              <Step
                index={3}
                title="Drive and record"
                body="The app derives your power curve from GPS acceleration."
              />
            </ol>
          </Zone>

          <Zone label="Why you calibrate once per gear">
            <Body>
              The app uses a steady-state RPM-to-speed reading to figure out your gear ratio and
              tyre size in a single number (rollout). Pick a flat road, hold a known RPM in your
              target gear for about 5 seconds, confirm.
            </Body>
          </Zone>

          <Zone label="Hands-free mode">
            <Body>
              You cannot reach the phone mid-pull on a motorcycle, so both steps have a hands-free
              variant. Start the recording while stopped, put the phone away, and ride. Calibration
              listens for every steady-speed hold and you pick the right one afterwards; a run
              session records the whole ride and picks out your pulls. Both stop themselves once you
              have been stationary for 20 seconds, so the analysis is already waiting when you pick
              the phone back up.
            </Body>
          </Zone>

          <Zone label="What a good run looks like">
            <Body>
              GPS accuracy matters. Wait for the GPS quality indicator before starting. Pick a
              straight road with little traffic. Hold a steady throttle from your starting speed to
              wherever the engine maxes out. The app stops automatically when you lift.
            </Body>
          </Zone>

          <Zone label="Glossary">
            <dl>
              <GlossaryItem
                term="Peak power (kW / hp)"
                definition="Biggest number on your curve, at the RPM where the engine pulls hardest."
              />
              <GlossaryItem
                term="0-100 km/h"
                definition="Only shown if your run started near a stop."
              />
              <GlossaryItem
                term="Quality score"
                definition="Composite of GPS sample rate, gaps, noise, and accel realism. Below 50 means the curve is probably unreliable."
              />
            </dl>
          </Zone>

          <Zone label="Public links">
            <Body>
              Tap Share on a run review to make a public link (no login needed to view) or to share
              a card image.
            </Body>
          </Zone>

          <Zone label="Getting the cleanest curve">
            <ul>
              {[
                'Clear-sky GPS: open road, no tunnels or canyons.',
                'One gear at a time.',
                'Smooth throttle from start to redline.',
                'Avoid wheelspin, it lies to the accelerometer.',
              ].map((tip) => (
                <li key={tip} className="rule-t flex gap-2.5 px-3 py-2 first:border-t-0">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0"
                    style={{ background: 'var(--color-ink)' }}
                  />
                  <span className="t-body text-[0.8125rem] leading-6">{tip}</span>
                </li>
              ))}
            </ul>
          </Zone>

          <NotesBox title="Where your data lives">
            Data is stored on wasgoht.ch and tied to your account. Public share links are only
            created when you explicitly opt in.
          </NotesBox>
        </div>

        <footer className="rule-t pb-safe shrink-0 px-4 py-2.5 text-center">
          <p className="t-annotation">
            v0.5{' '}
            <a href="https://wasgoht.ch" className="no-underline hover:underline">
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
  /** When set, renders a "Help" text label after the icon (used in the desktop sidebar). */
  labelled?: boolean;
}

export function HelpButton({ className, labelled }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Help"
        onClick={() => setOpen(true)}
        className={className ?? 'ctl px-2'}
        style={className ? undefined : { minHeight: 40 }}
      >
        <HelpIcon />
        {labelled && (
          <span className="t-label" style={{ color: 'inherit' }}>
            Help
          </span>
        )}
      </button>
      <HelpDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
