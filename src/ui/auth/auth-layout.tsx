import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { NotesBox, TitleBlock } from '@/ui/plate';
import { SuiteMark, Wordmark } from '@/ui/components/brand-wordmark';

/**
 * The cover sheet of the binder. Every way into the product (sign in, sign up,
 * both password-reset steps, the two hand-off screens) is the same plate: a
 * title block naming the procedure, one boxed form, and a notes box carrying
 * the consent text. Nothing here is a card, and nothing is unnamed.
 */

/** The title block of a cover sheet. One per screen, so one h1 per screen. */
export function BrandHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <TitleBlock
      ident="wasgoht"
      title={title ?? 'Sign in'}
      meta={[
        // "Procedure / Account access" restated the title directly above it and
        // "One account, both tools" restated the briefing column beside it, so
        // both cells cost a line and told the reader nothing. A subtitle a
        // screen actually supplies is real information and keeps its cell.
        ...(subtitle ? [{ label: 'Procedure', value: subtitle }] : []),
        { label: 'Tools', value: 'DynoRun and Grip' },
      ]}
    />
  );
}

export function LegalFootnote() {
  return (
    <NotesBox title="Consent">
      By continuing you agree to our{' '}
      <Link to="/privacy" className="underline" style={{ color: 'var(--color-ink)' }}>
        Privacy Policy
      </Link>
      . One strictly necessary session cookie, no analytics, no tracking. See also the{' '}
      <Link to="/imprint" className="underline" style={{ color: 'var(--color-ink)' }}>
        Imprint
      </Link>
      .
    </NotesBox>
  );
}

const BRIEFING: { label: string; value: string }[] = [
  { label: 'Input', value: 'GPS speed from the phone, or a RaceBox session CSV' },
  { label: 'Output', value: 'Wheel power vs RPM, traction envelope, lap deltas' },
  { label: 'Hardware', value: 'A phone. No rollers, no dongle, no drum' },
  { label: 'Sign-in', value: 'Email and password, or Google, Apple, Discord' },
];

/**
 * The marginal column: what the sheet is for, stated before you commit to it.
 * Desktop only, because on a phone the form is the whole job.
 */
function BriefingColumn() {
  return (
    <aside className="hidden lg:block" aria-label="What this is">
      <p className="t-display text-[clamp(2rem,3.2vw,2.9rem)]">
        Record. Compare. Decide.
      </p>
      <p className="t-body mt-4 max-w-[46ch]">
        Two tools under one account: a GPS virtual dyno that derives a wheel-power
        curve from a single pull, and a track-session analyzer that shows where the
        grip and the lap time went.
      </p>
      <dl className="mt-8">
        {BRIEFING.map((row) => (
          <div key={row.label} className="rule-t py-3">
            <dt className="t-annotation">{row.label}</dt>
            <dd className="t-body mt-1 text-[0.8125rem] leading-6">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="rule-section t-annotation mt-2 pt-2">
        Wheel power is a comparative estimate, not a calibrated dyno figure.
      </p>
    </aside>
  );
}

/** The shared frame. Every auth screen renders inside it, so none can drift. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-sheet)' }}>
      <header className="rule-b pt-safe flex items-center justify-between gap-4 px-4 py-3">
        <Link
          to="/hello"
          className="flex items-center gap-2.5 no-underline"
          style={{ color: 'var(--color-ink)' }}
          aria-label="wasgoht home"
        >
          <SuiteMark size={22} />
          <Wordmark brand="suite" className="text-[0.9375rem]" />
        </Link>
        <Link to="/demo" className="t-annotation no-underline hover:underline">
          See a real run
        </Link>
      </header>

      <main className="flex-1 px-4 py-8 lg:px-8 lg:py-14">
        <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-16">
          <BriefingColumn />
          <div className="plate-issue mx-auto flex w-full max-w-md flex-col gap-5">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Every text input on a cover sheet is the plate's ruled field. */
export const inputClass = 'field';

/** The one committing action: a solid ink plate, full width. */
export const primaryButtonClass = 'ctl ctl-solid w-full';
