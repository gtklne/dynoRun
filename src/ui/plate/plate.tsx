import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * The plate apparatus. Every screen in this product is an instrument approach
 * plate and reuses these slots, which is what keeps DynoRun, Grip and the
 * landing page one document type instead of three products bolted together.
 *
 * Slots, in reading order: title block, plan view, profile view, minima table,
 * notes box, revision bar. A screen omits slots it has no content for; it never
 * invents a new one, and it never wraps content in an unnamed container.
 */

export function Plate({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`plate-stack ${className}`}>{children}</div>;
}

/**
 * The title block names what you are looking at and what identifies it. Every
 * plate carries one, because an unlabelled sheet is the failure this world
 * exists to prevent: `ident` is the subject (vehicle, session, track), `title`
 * is the procedure (what this screen does), `meta` is the marginal apparatus.
 */
export function TitleBlock({
  ident,
  title,
  meta,
  actions,
}: {
  ident?: string;
  title: string;
  meta?: { label: string; value: ReactNode }[];
  actions?: ReactNode;
}) {
  return (
    <header className="plane">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          {ident && <p className="t-annotation mb-1 truncate">{ident}</p>}
          <h1 className="t-plate-title">{title}</h1>
        </div>
        {meta && meta.length === 1 && (
          <div className="min-w-0">
            <p className="t-annotation">{meta[0].label}</p>
            <p className="t-data mt-1 text-sm">{meta[0].value}</p>
          </div>
        )}
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && meta.length > 1 && (
        <dl
          className="rule-t meta-grid"
          style={
            {
              // The track is sized to the cells present, at each breakpoint, and
              // it has to come through custom properties rather than an inline
              // grid-template: an inline template beats the responsive class and
              // held four cells four-across on a phone, which pushed the last
              // cell's control straight through the frame's right hairline.
              '--meta-cols': Math.min(meta.length, 4),
              '--meta-cols-narrow': Math.min(meta.length, 2),
            } as CSSProperties
          }
        >
          {meta.map((m) => (
            <div key={m.label} className="meta-cell px-3 py-2 sm:px-4">
              <dt className="t-annotation">{m.label}</dt>
              <dd className="t-data mt-1 min-w-0 text-sm">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/**
 * A named region of the plate. `label` is mandatory by design: no zone on this
 * sheet goes unnamed, so wayfinding is reading rather than guessing.
 */
export function Zone({
  label,
  note,
  actions,
  children,
  framed = true,
  flush = false,
  accent = false,
  className = '',
}: {
  label: string;
  note?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Kept for call-site compatibility; a block is a plane either way. */
  framed?: boolean;
  /**
   * The one earned accent plane on this screen. Exactly one block per view may
   * take it: the reading the screen exists for. Two accents is no accent.
   */
  accent?: boolean;
  /** The body sets its own padding (tables, canvases, nested planes). */
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`${framed ? (accent ? 'plane-ink' : 'plane') : ''} ${className}`}
      aria-label={label}
    >
      <div className="block-head">
        <h2 className="t-label">{label}</h2>
        {note && <p className="t-annotation">{note}</p>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <div className={flush ? 'block-body-flush' : 'block-body'}>{children}</div>
    </section>
  );
}

/**
 * The plan view: the spatial panel (track map, power-curve field). It carries
 * its own scale statement, the way a chart's plan view always does, so a reader
 * never has to infer what a distance on screen means.
 */
export function PlanView({
  label,
  scale,
  legend,
  children,
}: {
  label: string;
  scale?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="plane">
      <figcaption className="block-head">
        <span className="t-label">{label}</span>
        {scale && <span className="t-annotation">{scale}</span>}
      </figcaption>
      <div className="relative">{children}</div>
      {legend && <div className="rule-t block-body">{legend}</div>}
    </figure>
  );
}

/**
 * The profile view: the strip beneath the plan, sharing its axis. Kept as its
 * own component so the axis relationship is structural rather than a layout
 * accident a later edit can break.
 */
export function ProfileView({
  label,
  axis,
  children,
}: {
  label: string;
  axis?: string;
  children: ReactNode;
}) {
  return (
    <figure className="plane">
      <figcaption className="block-head">
        <span className="t-annotation">{label}</span>
        {axis && <span className="t-annotation">{axis}</span>}
      </figcaption>
      <div className="relative">{children}</div>
    </figure>
  );
}

/**
 * The notes box. Charts carry their caveats on the sheet rather than in a
 * footnote nobody reads, and this product's honesty about what a measurement is
 * worth is a stated product principle, so it gets a designated place.
 */
export function NotesBox({ title = 'Notes', children }: { title?: string; children: ReactNode }) {
  return (
    <aside className="plane-2 block-body">
      <p className="t-annotation mb-1.5">{title}</p>
      <div className="t-body text-[0.8125rem] leading-6">{children}</div>
    </aside>
  );
}

/**
 * An advisory you have to read before trusting the sheet: poor GPS, a masked
 * section, a missing envelope. Amber is spent here and nowhere else.
 */
export function Advisory({
  children,
  tone = 'caution',
  urgent = false,
}: {
  children: ReactNode;
  tone?: 'caution' | 'plain';
  /**
   * Interrupts the reader instead of waiting to be noticed. Reserve it for an
   * advisory whose next tap writes a wrong number, not for one that merely
   * describes conditions: an assertive region that fires routinely trains the
   * reader to ignore the one that matters.
   */
  urgent?: boolean;
}) {
  const caution = tone === 'caution';
  return (
    <div
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      className="flex items-start gap-3 block-body"
      style={
        caution
          ? { borderColor: 'var(--color-caution)', background: 'var(--color-caution-tint)' }
          : undefined
      }
    >
      <span
        aria-hidden="true"
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        style={{ background: caution ? 'var(--color-caution)' : 'var(--color-terrain)' }}
      />
      <p className="t-body m-0 text-[0.8125rem] leading-6" style={{ color: 'var(--color-ink)' }}>
        {children}
      </p>
    </div>
  );
}

/**
 * The revision bar. A chart states its effective date and origin because a
 * reader has to know which revision they are flying; here it carries the data
 * provenance (pipeline version, sample rate, source file) for the same reason.
 */
export function RevisionBar({ entries }: { entries: { label: string; value: ReactNode }[] }) {
  return (
    <footer className="rule-section flex flex-wrap gap-x-6 gap-y-1 pt-2">
      {entries.map((e) => (
        <p key={e.label} className="t-annotation">
          {e.label} <span style={{ color: 'var(--color-ink-2)' }}>{e.value}</span>
        </p>
      ))}
    </footer>
  );
}

/**
 * A labelled row: name and note on the left, control or value on the right,
 * hairline between rows. Settings, the tool index and every list of named
 * choices are this shape, and three screens had each grown their own copy.
 *
 * `to`/`href` turn it into a navigation row, which is why the chevron lives
 * here: a row that leads somewhere says so, and it says so the same way
 * everywhere.
 */
export function PlateRow({
  label,
  note,
  value,
  to,
  href,
  onClick,
  children,
}: {
  label: string;
  note?: ReactNode;
  value?: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const navigates = Boolean(to || href || onClick);

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="t-label" style={{ color: 'var(--color-ink)' }}>
          {label}
        </p>
        {note && <p className="t-annotation mt-1 normal-case tracking-normal">{note}</p>}
      </div>
      {value !== undefined && <span className="t-data shrink-0 text-sm">{value}</span>}
      {children}
      {navigates && <Chevron />}
    </>
  );

  const shell = 'rule-b flex items-center gap-4 px-3 py-3 text-left no-underline';

  if (to) {
    return (
      <Link to={to} className={`${shell} transition-colors hover:bg-[var(--color-sunk)]`}>
        {body}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={`${shell} transition-colors hover:bg-[var(--color-sunk)]`}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${shell} w-full transition-colors hover:bg-[var(--color-sunk)]`}
      >
        {body}
      </button>
    );
  }
  return <div className={shell}>{body}</div>;
}

/**
 * The one directional glyph in the system, drawn at the same stroke weight as
 * every other icon. Three files had drawn their own; a chevron that differs by
 * a quarter pixel between screens is exactly the sloppiness this world removes.
 */
export function Chevron({
  direction = 'right',
  size = 14,
}: {
  direction?: 'right' | 'left' | 'up' | 'down';
  size?: number;
}) {
  const rotation = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
      style={{ transform: `rotate(${rotation}deg)`, color: 'var(--color-ink-3)' }}
    >
      <polyline
        points="5.5 2.5 11 8 5.5 13.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
    </svg>
  );
}
