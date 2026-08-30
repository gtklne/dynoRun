import type { ReactNode } from 'react';

/**
 * The primary reading. It dwarfs its own label, because the number is what a
 * rider reads at arm's length through a visor, and it carries its unit and its
 * provenance so it can never be lifted out of context as a bare score.
 *
 * This is deliberately NOT a stat card: no box of its own by default, no
 * shadow, no icon, no equal-sized siblings filling a grid. Readouts sit inside
 * a Zone or a minima row, where the rules already say what they belong to.
 */
export function Readout({
  value,
  unit,
  label,
  note,
  size = 'md',
  tone = 'ink',
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  note?: ReactNode;
  size?: 'md' | 'xl';
  /** Judgement, not decoration: go = gained or within, stop = lost or at the
   *  limit, caution = read this first. `ink` is the ordinary case. */
  tone?: 'ink' | 'go' | 'caution' | 'stop';
}) {
  const color = tone === 'ink' ? undefined : { color: `var(--color-${tone})` };

  return (
    <div>
      <p className="t-annotation">{label}</p>
      <p className={`${size === 'xl' ? 't-readout-xl' : 't-readout'} mt-1.5`} style={color}>
        {value}
        {unit && (
          <span
            className="t-unit ml-1.5 align-baseline"
            style={{ fontSize: '0.28em' }}
          >
            {unit}
          </span>
        )}
      </p>
      {note && <p className="t-annotation mt-1.5">{note}</p>}
    </div>
  );
}

/**
 * A measurement that could not be taken. Never a zero, never a dash glyph, and
 * never blank: the plate says which reading is missing and why, because "no
 * envelope" and "an envelope of 0 g" are opposite facts about the session.
 */
export function NoReading({ label, reason }: { label: string; reason: string }) {
  return (
    <div>
      <p className="t-annotation">{label}</p>
      <p className="t-readout-sm mt-1.5">n/a</p>
      <p className="t-annotation mt-1.5">{reason}</p>
    </div>
  );
}

/**
 * A channel strip: the swatch, name, unit and current value of one series.
 * Shared by every chart legend in the product, so a lap, a run and a sensor
 * channel are all identified the same way.
 */
export function ChannelStrip({
  color,
  dash,
  name,
  unit,
  value,
  active = false,
  onClick,
}: {
  color: string;
  dash?: number[];
  name: string;
  unit?: string;
  value?: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const swatch = (
    <svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="5"
        x2="22"
        y2="5"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={dash && dash.length ? dash.join(' ') : undefined}
      />
    </svg>
  );

  const body = (
    <>
      {swatch}
      <span className="t-label t-label-strong min-w-0 flex-1 truncate">{name}</span>
      {value !== undefined && (
        <span className="t-data shrink-0 text-sm">
          {value}
          {unit && <span className="t-annotation ml-1">{unit}</span>}
        </span>
      )}
    </>
  );

  if (!onClick) {
    return <div className="flex items-center gap-2.5 px-3 py-2">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      aria-pressed={active}
      className="ctl flex w-full items-center gap-2.5 border-0 px-3 py-2 text-left normal-case"
      style={{ minHeight: 40, letterSpacing: 'normal' }}
    >
      {body}
    </button>
  );
}
