interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
  /**
   * The headline figure of its block. It is set at full ink weight, never in a
   * hue: identity and judgement are separate channels here, so "this is the
   * important one" cannot borrow the colour that means "this one is wrong".
   */
  accent?: boolean;
  /** Judgement, and only judgement: gained, read this first, at the limit. */
  tone?: 'ink' | 'go' | 'caution' | 'stop';
}

/**
 * One cell of a ruled figure block, NOT a card.
 *
 * It has no frame of its own on purpose: the rules of the block it sits in say
 * what it belongs to, the way a chart's marginal figures do. Callers put these
 * inside a `Zone` and separate them with `rule-l` / `rule-t`, so a row of
 * readings reads as one boxed table rather than a grid of floating tiles.
 */
export function StatTile({ label, value, subtitle, accent = false, tone = 'ink' }: StatTileProps) {
  return (
    <div className="px-3 py-2">
      <p className="t-annotation truncate">{label}</p>
      <p
        className={`t-data mt-1 truncate ${accent ? 'text-2xl' : 'text-xl'}`}
        style={tone === 'ink' ? undefined : { color: `var(--color-${tone})` }}
      >
        {value}
      </p>
      {subtitle && <p className="t-annotation mt-0.5 truncate">{subtitle}</p>}
    </div>
  );
}
