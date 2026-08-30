/**
 * Marks in the plate's own symbology.
 *
 * A chart's symbols are drawn in ink and each one means something; none of them
 * is a coloured tile. So the suite mark is a registration cross (the mark a
 * printed sheet carries to prove it is aligned), DynoRun's is the profile trace
 * it draws, and Grip's is the traction circle it draws.
 *
 * Colour is deliberately absent: in this world hue is spent only where it
 * changes a decision, so the two tools are told apart by their glyph and by the
 * plate's own title block, never by a brand colour competing with the data.
 */

interface WordmarkProps {
  brand?: 'suite' | 'dynorun' | 'grip';
  className?: string;
}

export function Wordmark({ brand = 'suite', className = '' }: WordmarkProps) {
  const text = brand === 'dynorun' ? 'DynoRun' : brand === 'grip' ? 'Grip' : 'wasgoht';
  return (
    <span
      className={className}
      style={{
        fontStretch: '87%',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--color-ink)',
      }}
    >
      {text}
    </span>
  );
}

/** The registration cross a printed sheet carries to prove it is aligned. */
export function SuiteMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      <rect x="1.5" y="1.5" width="21" height="21" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="1.5" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="16" x2="12" y2="22.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="1.5" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <line x1="16" y1="12" x2="22.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Grip's mark: the traction circle, with the sample sitting off centre. */
export function GripMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.75" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <line x1="12" y1="1.5" x2="12" y2="22.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="1.5" y1="12" x2="22.5" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="16.4" cy="7.6" r="2.1" fill="currentColor" />
    </svg>
  );
}
