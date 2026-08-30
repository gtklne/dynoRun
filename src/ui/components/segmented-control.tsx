interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** When true, use a more compact size, for embedding in zone headers. */
  compact?: boolean;
  ariaLabel?: string;
}

/**
 * The plate's segmented strip: one ruled frame, hairline dividers, the selected
 * cell inverted to solid ink. Visually identical to `PlateSegmented`, but it
 * keeps the tablist/tab roles its call sites (and their tests) already depend
 * on, so a lap selector and a units switch still read as the same instrument.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="plane-2 inline-flex"
      style={{ isolation: 'isolate' }}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-active={selected}
            onClick={() => onChange(opt.value)}
            className={`ctl border-0 ${i > 0 ? 'rule-l' : ''}`}
            style={
              compact
                ? { minHeight: 32, padding: '0.25rem 0.625rem', fontSize: '0.6875rem' }
                : { minHeight: 40, padding: '0.375rem 0.75rem' }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
