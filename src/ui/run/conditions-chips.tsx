import type { RunConditions } from '@/shared/types';

export interface ConditionsChipsProps {
  conditions: RunConditions;
  size?: 'sm' | 'md';
}

function formatSurface(surface: string): string {
  return surface
    .split(/\s+/)
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function signedNumber(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

function conditionLabels(c: RunConditions, size: 'sm' | 'md'): string[] {
  const labels: string[] = [];
  if (typeof c.ambient_temp_c === 'number') {
    labels.push(`${c.ambient_temp_c}°C`);
  }
  if (typeof c.wind_kmh === 'number') {
    const value = signedNumber(c.wind_kmh);
    labels.push(size === 'md' ? `${value} km/h wind` : `${value} km/h`);
  }
  if (typeof c.road_slope_pct === 'number') {
    const value = signedNumber(c.road_slope_pct);
    labels.push(size === 'md' ? `${value}% grade` : `${value}%`);
  }
  if (c.surface) {
    labels.push(formatSurface(c.surface));
  }
  return labels;
}

function hasAnyCondition(c: RunConditions): boolean {
  return (
    typeof c.ambient_temp_c === 'number' ||
    typeof c.wind_kmh === 'number' ||
    typeof c.road_slope_pct === 'number' ||
    !!c.surface
  );
}

export function ConditionsChips({ conditions, size = 'md' }: ConditionsChipsProps) {
  if (!hasAnyCondition(conditions)) return null;
  const labels = conditionLabels(conditions, size);
  const className =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-400 tabular-nums'
      : 'bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 text-xs text-zinc-200 tabular-nums';
  const wrapperClass = size === 'sm' ? 'flex flex-wrap gap-1' : 'flex flex-wrap gap-2';
  return (
    <div className={wrapperClass} data-testid="conditions-chips" data-size={size}>
      {labels.map((label) => (
        <span key={label} className={className}>
          {label}
        </span>
      ))}
    </div>
  );
}
