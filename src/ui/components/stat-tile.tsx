interface StatTileProps {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}

/**
 * One cell of a ruled figure block, NOT a card.
 *
 * It has no frame of its own on purpose: the rules of the block it sits in say
 * what it belongs to, the way a chart's marginal figures do. Callers put these
 * inside a `Zone` and separate them with `rule-l` / `rule-t`, so a row of
 * readings reads as one boxed table rather than a grid of floating tiles.
 */
export function StatTile({ label, value, subtitle, accent = false }: StatTileProps) {
  return (
    <div className="px-3 py-2.5">
      <p className="t-annotation truncate">{label}</p>
      <p
        className="t-data mt-1.5 truncate text-xl"
        style={accent ? { color: 'var(--color-procedure)' } : undefined}
      >
        {value}
      </p>
      {subtitle && <p className="t-annotation mt-1 truncate">{subtitle}</p>}
    </div>
  );
}
