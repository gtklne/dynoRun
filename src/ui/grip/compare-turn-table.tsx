import { useMemo, useState } from 'react';
import type { ComparedCorner, ComparedCornerStat, GripComparison } from '@/analysis/grip/compare';
import { PAYOFF_HINT, PAYOFF_LABEL, turnPayoff, type TurnPayoff } from '@/analysis/grip/compare-stats';
import { MinimaTable, Na, PlateSegmented, usePlateInk, type MinimaColumn } from '@/ui/plate';
import { deltaTextClass, formatDelta } from './compare-colors';
import { scoreColor } from './colors';

interface Props {
  cmp: GripComparison;
  refKey: string;
  subjectKey: string;
  anchorG: number;
  /** metres: highlights the turn the cursor is inside */
  cursor: number;
  onSelectTurn: (s: number) => void;
}

/**
 * A verdict is a reading, so it gets ink rather than decoration: gain where the
 * subject came out ahead, caution where it gave something up, procedure where
 * it paid demand and got nothing back.
 */
const PAYOFF_INK: Record<TurnPayoff, string> = {
  unmeasured: 'var(--color-ink-3)',
  level: 'var(--color-ink-2)',
  'faster-more-g': 'var(--color-gain)',
  'faster-other': 'var(--color-gain)',
  'slower-backed-off': 'var(--color-caution)',
  'slower-despite-g': 'var(--color-procedure)',
  'level-cheaper': 'var(--color-gain)',
  'level-dearer': 'var(--color-caution)',
};

type Order = 'loss' | 'track';

interface Row {
  c: ComparedCorner;
  ref: ComparedCornerStat | undefined;
  sub: ComparedCornerStat | undefined;
  dTime: number;
  dScore: number;
  dSpeed: number;
  dLean: number;
  dLoad: number;
  payoff: TurnPayoff;
}

/**
 * Turn-by-turn, reference against one subject lap. Every row is measured over
 * the identical spatial window, so the comparison holds even when the two laps'
 * own corner detection disagreed about how many corners there were.
 */
export function CompareTurnTable({ cmp, refKey, subjectKey, anchorG, cursor, onSelectTurn }: Props) {
  const [order, setOrder] = useState<Order>('loss');
  const ink = usePlateInk();

  const rows = useMemo<Row[]>(() => {
    const out = cmp.corners.map((c) => {
      const ref = c.stats.find((s) => s.key === refKey);
      const sub = c.stats.find((s) => s.key === subjectKey);
      // NaN when either lap left the layout before this turn, kept as NaN so
      // the verdict reads "not on this lap" instead of "Matched"
      const dTime = sub && ref ? sub.deltaGain - ref.deltaGain : NaN;
      const dScore = sub && ref ? sub.apexScore - ref.apexScore : NaN;
      return {
        c,
        ref,
        sub,
        dTime,
        dScore,
        dSpeed: sub && ref ? (sub.minSpeed - ref.minSpeed) * 3.6 : 0,
        dLean: sub && ref ? sub.maxLean - ref.maxLean : 0,
        dLoad: sub && ref ? sub.peakLoad - ref.peakLoad : 0,
        payoff: turnPayoff(dTime, dScore),
      };
    });
    // a NaN comparator result leaves the sort implementation-defined; park
    // unmeasured turns at the end instead
    return order === 'loss'
      ? [...out].sort((a, b) => (Number.isFinite(b.dTime) ? b.dTime : -Infinity) - (Number.isFinite(a.dTime) ? a.dTime : -Infinity))
      : out;
  }, [cmp.corners, refKey, subjectKey, order]);

  const activeTurn = cmp.corners.find((c) => cursor >= c.sIn && cursor <= c.sOut)?.turn ?? null;
  const worst = rows.filter((r) => Number.isFinite(r.dTime) && r.dTime > 0.05).sort((a, b) => b.dTime - a.dTime).slice(0, 3);
  const unmeasured = rows.filter((r) => r.payoff === 'unmeasured').length;
  const sameLap = refKey === subjectKey;

  if (!cmp.corners.length) {
    return (
      <section aria-label="Turn by turn">
        <h2 className="t-label mb-2">Turn by turn</h2>
        <div className="box-frame hatch px-3 py-6 text-center">
          <p className="t-annotation" style={{ color: 'var(--color-ink-2)' }}>
            No turns were detected on these laps. Lower &ldquo;Min lean for a corner&rdquo; in Settings if the track
            has only gentle bends.
          </p>
        </div>
      </section>
    );
  }

  /**
   * A turn outside the subject's common section still has values; they are just
   * measured on different tarmac. Printing them beside an n/a for time invites
   * exactly the comparison the mask exists to prevent, so the whole row reads
   * n/a.
   */
  const off = (r: Row) => r.payoff === 'unmeasured';

  const delta = (value: number, dp: number, eps: number) => (
    <span className={`ml-1.5 text-[11px] ${deltaTextClass(value, eps)}`}>{formatDelta(value, dp)}</span>
  );

  const columns: MinimaColumn<Row>[] = [
    {
      key: 'turn',
      head: 'Turn',
      cell: (r) => (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 ${off(r) ? 'hatch' : ''}`}
            style={off(r) ? undefined : { background: scoreColor(ink, (r.sub?.apexScore ?? 0) / 100, anchorG) }}
          />
          T{r.c.turn}
          <span className="t-annotation">{r.c.dir === 'L' ? 'Left' : 'Right'}</span>
        </span>
      ),
    },
    {
      key: 'dt',
      head: 'Δ time',
      numeric: true,
      cell: (r) =>
        sameLap || off(r) ? (
          <Na title={off(r) ? 'Not on the subject lap’s section of track' : 'Reference against itself'} />
        ) : (
          <span className={deltaTextClass(r.dTime)}>{formatDelta(r.dTime)}s</span>
        ),
    },
    {
      key: 'apex',
      head: 'Apex demand',
      numeric: true,
      cell: (r) =>
        off(r) ? (
          <Na />
        ) : (
          <>
            {Math.round(r.sub?.apexScore ?? 0)}
            {!sameLap && Number.isFinite(r.dScore) && delta(r.dScore, 0, 3)}
          </>
        ),
    },
    {
      key: 'spd',
      head: 'Min speed',
      numeric: true,
      cell: (r) =>
        off(r) ? (
          <Na />
        ) : (
          <>
            {Math.round((r.sub?.minSpeed ?? 0) * 3.6)}
            {!sameLap && delta(r.dSpeed, 0, 1)}
          </>
        ),
    },
    {
      key: 'lean',
      head: 'Lean',
      numeric: true,
      cell: (r) =>
        off(r) ? (
          <Na />
        ) : (
          <>
            {Math.round(r.sub?.maxLean ?? 0)}°
            {!sameLap && <span className="t-annotation ml-1.5">{formatDelta(r.dLean, 0)}</span>}
          </>
        ),
    },
    {
      key: 'load',
      head: 'Transfer',
      numeric: true,
      cell: (r) =>
        off(r) ? (
          <Na />
        ) : (
          <>
            {(r.sub?.peakLoad ?? 0).toFixed(1)}
            {!sameLap && <span className="t-annotation ml-1.5">{formatDelta(r.dLoad, 1)}</span>}
          </>
        ),
    },
    {
      key: 'payoff',
      head: 'What happened',
      cell: (r) => (
        <span style={{ color: PAYOFF_INK[r.payoff] }} title={PAYOFF_HINT[r.payoff]}>
          {sameLap ? `ref ${Math.round(r.ref?.apexScore ?? 0)} pts` : PAYOFF_LABEL[r.payoff]}
        </span>
      ),
    },
  ];

  return (
    <section aria-label="Turn by turn">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="t-label">Turn by turn</h2>
          <p className="t-annotation mt-1" style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
            {sameLap ? (
              <>Pick a second lap to see per-turn deltas.</>
            ) : worst.length ? (
              <>
                Most time to find at{' '}
                <b style={{ color: 'var(--color-procedure)' }}>{worst.map((r) => `T${r.c.turn}`).join(', ')}</b>
                {': '}
                {formatDelta(worst.reduce((s, r) => s + r.dTime, 0))}s of the gap sits there.
              </>
            ) : (
              <>No turn is losing more than 0.05 s. The gap is spread across the lap.</>
            )}
            {unmeasured > 0 && (
              <> · {unmeasured} turn{unmeasured === 1 ? '' : 's'} not on the subject lap&rsquo;s section of track.</>
            )}
          </p>
        </div>
        <PlateSegmented
          label="Turn order"
          value={order}
          options={[
            { value: 'loss', label: 'Biggest loss' },
            { value: 'track', label: 'Track order' },
          ]}
          onChange={setOrder}
        />
      </div>

      <div className="box-frame">
        <MinimaTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.c.turn)}
          selectedKey={activeTurn == null ? null : String(activeTurn)}
          onSelect={(r) => onSelectTurn(r.c.s)}
          caption="Demand is a score: g × 100, so 110 ≈ 1.10 g. Δ columns are the subject lap minus the reference, measured over the same stretch of track on both laps."
        />
      </div>
    </section>
  );
}
