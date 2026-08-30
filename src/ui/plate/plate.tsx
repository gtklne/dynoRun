import type { ReactNode } from 'react';

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
    <header className="box-frame">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          {ident && <p className="t-annotation mb-1 truncate">{ident}</p>}
          <h1 className="t-plate-title">{title}</h1>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && meta.length > 0 && (
        <dl className="rule-t grid grid-cols-2 sm:grid-cols-4">
          {meta.map((m, i) => (
            <div
              key={m.label}
              className={`px-3 py-2 sm:px-4 ${i > 0 ? 'rule-l' : ''} ${i >= 2 ? 'rule-t sm:border-t-0' : ''}`}
            >
              <dt className="t-annotation">{m.label}</dt>
              <dd className="t-data mt-1 text-sm">{m.value}</dd>
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
  className = '',
}: {
  label: string;
  note?: string;
  actions?: ReactNode;
  children: ReactNode;
  framed?: boolean;
  className?: string;
}) {
  return (
    <section className={className} aria-label={label}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="t-label">{label}</h2>
          {note && <p className="t-annotation">{note}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={framed ? 'box-frame' : ''}>{children}</div>
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
    <figure className="box-frame">
      <figcaption className="rule-b flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
        <span className="t-label">{label}</span>
        {scale && <span className="t-annotation">{scale}</span>}
      </figcaption>
      <div className="relative">{children}</div>
      {legend && <div className="rule-t px-3 py-2">{legend}</div>}
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
    <figure className="box">
      <figcaption className="rule-b flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-1.5">
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
    <aside className="box plate-sunk px-3 py-2.5">
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
}: {
  children: ReactNode;
  tone?: 'caution' | 'plain';
}) {
  const caution = tone === 'caution';
  return (
    <div
      role="status"
      className="box flex items-start gap-3 px-3 py-2.5"
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
