interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** When true, use a more compact size — for embedding in card headers. */
  compact?: boolean;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const sizing = compact ? 'text-[11px] py-1.5' : 'text-xs py-2';
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex bg-zinc-800 rounded-xl p-1 border border-zinc-700">
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-3 ${sizing} rounded-lg font-semibold uppercase tracking-wider transition-colors ${
              selected
                ? 'bg-amber-500 text-zinc-950 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
