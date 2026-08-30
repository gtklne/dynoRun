import type { GripCorner, GripLap } from '@/analysis/grip/types';
import type { GripSettings } from '@/analysis/grip/settings';
import { MinimaTable, Na, usePlateInk, type MinimaColumn } from '@/ui/plate';
import type { GripMetricMode } from './metric-mode';
import { rateColor, scoreColor } from './colors';

export interface CornerLiveStats {
  /** apex demand in g against the active metric */
  apexG: number;
  /** robust peak demand in g through the corner */
  peakG: number;
}

interface CornerMinimaProps {
  lap: GripLap;
  liveStats: Map<number, CornerLiveStats>;
  /** best apex demand per TRACK TURN across ALL laps (same metric) */
  bestApexG: Map<number, number>;
  mode: GripMetricMode;
  settings: Pick<GripSettings, 'spareScore' | 'rateFS' | 'anchorG'>;
  /** global sample index of the corner the cursor is inside */
  activeCorner: number | null;
  onSelect: (corner: GripCorner) => void;
}

const score = (g: number) => Math.round(g * 100);

/** A corner's own best across the session, or 0 when it has no turn identity. */
const bestFor = (c: GripCorner, best: Map<number, number>) => (c.turn ? best.get(c.turn) ?? 0 : 0);

interface Row {
  c: GripCorner;
  apexG: number;
  peakG: number;
  best: number;
  gap: number;
  spare: boolean;
  isBest: boolean;
}

/**
 * The minima table: one boxed decision table, one row per corner, never a grid
 * of cards. Rows are keyed on the TRACK turn, because a per-lap detection index
 * pairs unrelated bends across laps (see turns.ts). A detection no other lap
 * agrees with has no turn identity, so it is marked as an extra bend and its
 * cross-lap columns read n/a rather than borrowing another turn's best.
 */
export function CornerMinima({
  lap,
  liveStats,
  bestApexG,
  mode,
  settings,
  activeCorner,
  onSelect,
}: CornerMinimaProps) {
  const ink = usePlateInk();
  const label = mode === 'load' ? 'apex load' : 'apex grip';

  const rows: Row[] = lap.corners.map((c) => {
    const stats = liveStats.get(c.n);
    const apexG = stats?.apexG ?? 0;
    const peakG = stats?.peakG ?? 0;
    const best = bestFor(c, bestApexG);
    const gap = score(best) - score(apexG);
    return {
      c,
      apexG,
      peakG,
      best,
      gap,
      spare: c.turn > 0 && gap >= settings.spareScore,
      isBest: c.turn > 0 && best > 0 && score(apexG) >= score(best),
    };
  });

  // corners with the biggest proven gap to the rider's own best on other laps
  const opportunities = rows
    .filter((r) => r.spare)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map((r) => `T${r.c.turn}`)
    .join(', ');

  const columns: MinimaColumn<Row>[] = [
    {
      key: 'turn',
      head: 'Turn',
      cell: (r) =>
        r.c.turn ? (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0"
              style={{ background: scoreColor(ink, r.apexG, settings.anchorG) }}
            />
            Turn {r.c.turn}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="hatch h-3 w-3 shrink-0" />
            <span className="t-annotation">Extra bend</span>
          </span>
        ),
    },
    { key: 'dir', head: 'Dir', cell: (r) => (r.c.dir === 'L' ? 'Left' : 'Right') },
    {
      key: 'apex',
      head: label,
      numeric: true,
      cell: (r) => (
        <span style={{ color: scoreColor(ink, r.apexG, settings.anchorG) }}>{score(r.apexG)}</span>
      ),
    },
    { key: 'peak', head: 'Peak', numeric: true, cell: (r) => score(r.peakG) },
    {
      key: 'best',
      head: 'Best here',
      numeric: true,
      cell: (r) =>
        r.c.turn && r.best > 0 ? (
          score(r.best)
        ) : (
          <Na title={r.c.turn ? 'No other lap has taken this turn yet' : 'No turn identity, so no cross-lap best'} />
        ),
    },
    {
      key: 'verdict',
      head: 'Against your best',
      cell: (r) =>
        r.spare ? (
          <span style={{ color: 'var(--color-caution)' }}>{r.gap} spare</span>
        ) : r.isBest ? (
          <span style={{ color: 'var(--color-gain)' }}>Session best</span>
        ) : r.c.turn && r.best > 0 ? (
          <span className="t-annotation">Matched</span>
        ) : (
          <Na title="Not compared across laps" />
        ),
    },
    { key: 'spd', head: 'Min speed', numeric: true, cell: (r) => `${Math.round(r.c.minSpeed * 3.6)} km/h` },
    { key: 'lean', head: 'Lean', numeric: true, cell: (r) => `${Math.round(r.c.maxLean)}°` },
    {
      key: 'load',
      head: 'Transfer',
      numeric: true,
      cell: (r) => (
        <span style={{ color: rateColor(ink, Math.min(1, r.c.peakLoad / settings.rateFS)) }}>
          {r.c.peakLoad.toFixed(1)} g/s
        </span>
      ),
    },
  ];

  return (
    <section aria-label="Corner minima">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-label">Corner minima</h2>
        <p className="t-annotation">
          {lap.corners.length} corners on this lap
          {opportunities && <> · spare grip at {opportunities}</>}
        </p>
      </div>
      <div className="box-frame">
        <MinimaTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.c.n)}
          selectedKey={activeCorner == null ? null : String(rows.find((r) => r.c.ap === activeCorner)?.c.n ?? '')}
          onSelect={(r) => onSelect(r.c)}
          empty="No corners detected on this lap"
          caption={`Score = ${label} × 100, so 100 ≈ 1 g. Turn numbers are the same bend on every lap${mode === 'load' ? '; dynamic load adds the transient to steady-state grip' : ''}.`}
        />
      </div>
    </section>
  );
}
