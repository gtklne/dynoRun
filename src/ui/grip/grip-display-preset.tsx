const PRESETS = [
  { label: 'Wet', value: 0.8 },
  { label: 'Normal', value: 1.1 },
  { label: 'Race', value: 1.2 },
  { label: 'Time attack', value: 1.3 },
];

/** Named shortcuts for the display scale; custom saved scales remain selectable. */
export function GripDisplayPreset({ value, onChange }: {
  value: number;
  onChange: (value: number) => void;
}) {
  const isPreset = PRESETS.some((preset) => preset.value === value);

  return (
    <select
      aria-label="Display preset"
      title="Display preset"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="field max-w-full"
      style={{ width: 'auto' }}
    >
      {!isPreset && <option value={value}>Custom · {value.toFixed(2)} g</option>}
      {PRESETS.map((preset) => (
        <option key={preset.value} value={preset.value}>
          {preset.label} · {preset.value.toFixed(1)} g
        </option>
      ))}
    </select>
  );
}
