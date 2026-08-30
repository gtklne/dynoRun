import type { Run } from '@/shared/types';
import { formatRelativeTime } from '@/shared/format-time';
import { convertPower, formatPower, type PowerUnit } from '@/shared/format-power';
import { ConditionsChips } from '@/ui/run/conditions-chips';
import {
  MinimaTable,
  Na,
  seriesInk,
  SERIES_DASH,
  usePlateInk,
  type MinimaColumn,
  type PlateInk,
} from '@/ui/plate';

interface Props {
  runs: Run[];
  selectedIds: Set<string>;
  onToggle: (runId: string) => void;
  unit: PowerUnit;
  bestRunId: string | null;
  /** Best peak among currently-selected runs (in kW). Used to show per-row deltas. */
  bestSelectedKw: number | null;
  /** ID of the run that owns `bestSelectedKw`: skip its own delta row. */
  bestSelectedRunId: string | null;
  /**
   * Position of each selected run in the overlay, so a row carries the exact
   * swatch its curve is drawn with. Without it a reader has to match runs to
   * lines by guessing, which is the one job a legend exists to remove.
   */
  seriesIndexById?: Map<string, number>;
}

function formatDeltaKw(deltaKw: number, unit: PowerUnit): string {
  const v = convertPower(deltaKw, unit);
  const decimals = unit === 'kW' ? 1 : 0;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±';
  return `${sign}${Math.abs(v).toFixed(decimals)} ${unit}`;
}

/** The overlay swatch: the ink AND the dash the curve is actually drawn with. */
function Swatch({ index, ink }: { index: number; ink: PlateInk }) {
  const colors = seriesInk(ink);
  const dash = SERIES_DASH[index % SERIES_DASH.length];
  return (
    <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="5"
        x2="26"
        y2="5"
        stroke={colors[index % colors.length]}
        strokeWidth="2.5"
        strokeDasharray={dash.length ? dash.join(' ') : undefined}
      />
    </svg>
  );
}

/** An unselected row shows an empty ruled cell where its swatch would go. */
function EmptySwatch() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 shrink-0"
      style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)' }}
    />
  );
}

export function CompareRunsPicker({
  runs,
  selectedIds,
  onToggle,
  unit,
  bestRunId,
  bestSelectedKw,
  bestSelectedRunId,
  seriesIndexById,
}: Props) {
  const ink = usePlateInk();

  const columns: MinimaColumn<Run>[] = [
    {
      key: 'overlay',
      head: 'On plot',
      cell: (r) => {
        const idx = seriesIndexById?.get(r.id);
        const on = selectedIds.has(r.id);
        return (
          <button
            type="button"
            aria-pressed={on}
            aria-label={`Overlay ${r.gear_label}, ${formatRelativeTime(r.started_at)}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(r.id);
            }}
            className="flex items-center justify-center p-1"
          >
            {on && idx != null ? <Swatch index={idx} ink={ink} /> : <EmptySwatch />}
          </button>
        );
      },
    },
    {
      key: 'run',
      head: 'Run',
      cell: (r) => {
        const secondary = r.title ?? (r.notes || null);
        return (
          <span className="block min-w-0">
            <span className="t-data block truncate text-sm">
              {r.gear_label} / {formatRelativeTime(r.started_at)}
            </span>
            {secondary && <span className="t-annotation mt-0.5 block truncate">{secondary}</span>}
            <span className="mt-1 block">
              <ConditionsChips conditions={r.conditions} size="sm" />
            </span>
          </span>
        );
      },
    },
    {
      key: 'peak',
      head: 'Peak',
      numeric: true,
      cell: (r) =>
        r.peak_power_kw == null ? <Na title="No peak recorded" /> : formatPower(r.peak_power_kw, unit),
    },
    {
      key: 'delta',
      head: 'Vs best selected',
      numeric: true,
      cell: (r) => {
        const showDelta =
          bestSelectedKw != null && r.peak_power_kw != null && r.id !== bestSelectedRunId;
        if (!showDelta || r.peak_power_kw == null || bestSelectedKw == null) {
          return <Na title="No selected run to measure against" />;
        }
        const deltaKw = r.peak_power_kw - bestSelectedKw;
        // Gained and lost, which is exactly what green and red mean here.
        const style =
          deltaKw > 0
            ? { color: 'var(--color-go)' }
            : deltaKw < 0
              ? { color: 'var(--color-stop)' }
              : undefined;
        return <span style={style}>{formatDeltaKw(deltaKw, unit)}</span>;
      },
    },
    {
      key: 'best',
      head: 'Best',
      cell: (r) =>
        r.id === bestRunId ? (
          <span className="t-label" style={{ color: 'var(--color-ink)' }}>
            Best
          </span>
        ) : (
          <Na title="Not the strongest run on file" />
        ),
    },
  ];

  return (
    <MinimaTable
      columns={columns}
      rows={runs}
      rowKey={(r) => r.id}
      onSelect={(r) => onToggle(r.id)}
      empty="No complete runs with a stored curve yet."
    />
  );
}
