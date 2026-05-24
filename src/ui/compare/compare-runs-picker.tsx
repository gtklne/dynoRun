import type { Run } from '@/shared/types';

interface Props {
  runs: Run[];
  selectedIds: Set<string>;
  onToggle: (runId: string) => void;
}

export function CompareRunsPicker({ runs, selectedIds, onToggle }: Props) {
  return (
    <ul>
      {runs.map((r) => {
        const label = r.notes || `${r.started_at} (${r.gear_label})`;
        return (
          <li key={r.id}>
            <label>
              <input
                type="checkbox"
                checked={selectedIds.has(r.id)}
                onChange={() => onToggle(r.id)}
                aria-label={label}
              />
              {label}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
