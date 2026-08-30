interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

/**
 * A ruled two-position switch. On inverts to solid ink rather than turning a
 * colour, the same state language every other control on the plate uses, so it
 * still reads as "on" through a visor and to a colour-blind reader.
 */
export function ToggleSwitch({ checked, onChange, ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-7 w-14 shrink-0 items-center"
      style={{
        border: 'var(--rule-strong) solid var(--color-ink)',
        background: checked ? 'var(--color-ink)' : 'var(--color-sheet)',
        transition: 'background-color 120ms var(--ease-plate)',
      }}
    >
      <span
        aria-hidden="true"
        className="block h-4 w-4"
        style={{
          background: checked ? 'var(--color-sheet)' : 'var(--color-ink)',
          transform: checked ? 'translateX(1.875rem)' : 'translateX(0.375rem)',
          transition: 'transform 120ms var(--ease-plate)',
        }}
      />
    </button>
  );
}
