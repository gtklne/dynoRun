import { useMemo, useState } from 'react';
import type { GripComparison } from '@/analysis/grip/compare';
import { PAYOFF_HINT, PAYOFF_LABEL, turnPayoff, type TurnPayoff } from '@/analysis/grip/compare-stats';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { deltaTextClass, formatDelta } from './compare-colors';
import { scoreColor } from './colors';

interface Props {
  cmp: GripComparison;
  refKey: string;
  subjectKey: string;
  anchorG: number;
  /** metres — highlights the turn the cursor is inside */
  cursor: number;
  onSelectTurn: (s: number) => void;
}

const PAYOFF_STYLE: Record<TurnPayoff, string> = {
  'unmeasured': 'text-zinc-600 italic',
  'level': 'text-zinc-500',
  'faster-more-g': 'text-sky-300',
  'faster-other': 'text-sky-400',
  'slower-backed-off': 'text-amber-400',
  'slower-despite-g': 'text-rose-400',
  'level-cheaper': 'text-sky-300',
  'level-dearer': 'text-amber-400',
};

type Order = 'loss' | 'track';

/**
 * Turn-by-turn, reference against one subject lap. Every row is measured over
 * the identical spatial window, so the comparison holds even when the two laps'
 * own corner detection disagreed about how many corners there were.
 */
export function CompareTurnTable({ cmp, refKey, subjectKey, anchorG, cursor, onSelectTurn }: Props) {
  const [order, setOrder] = useState<Order>('loss');

  const rows = useMemo(() => {
    const out = cmp.corners.map((c) => {
      const ref = c.stats.find((s) => s.key === refKey);
      const sub = c.stats.find((s) => s.key === subjectKey);
      // NaN when either lap left the layout before this turn — kept as NaN so
      // the verdict reads "Not on this lap" instead of "Matched"
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
      <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-sm text-zinc-500">
        No turns were detected on these laps — lower “Min lean for a corner” in Settings if the track has only gentle bends.
      </p>
    );
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Turn by turn</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {sameLap ? (
              <>Pick a second lap to see per-turn deltas.</>
            ) : worst.length ? (
              <>
                Most time to find at{' '}
                <b className="text-rose-400">{worst.map((r) => `T${r.c.turn}`).join(', ')}</b>
                {' — '}
                {formatDelta(worst.reduce((s, r) => s + r.dTime, 0))}s of the gap sits there.
              </>
            ) : (
              <>No turn is losing more than 0.05 s — the gap is spread across the lap.</>
            )}
            {unmeasured > 0 && (
              <> · {unmeasured} turn{unmeasured === 1 ? '' : 's'} not on the subject lap’s section of track.</>
            )}
          </p>
        </div>
        <SegmentedControl
          ariaLabel="Turn order"
          compact
          options={[
            { value: 'loss', label: 'Biggest loss' },
            { value: 'track', label: 'Track order' },
          ]}
          value={order}
          onChange={(v) => setOrder(v as Order)}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="px-3 py-2 font-semibold">Turn</th>
              <th className="px-3 py-2 text-right font-semibold">Δ time</th>
              <th className="px-3 py-2 text-right font-semibold">Apex demand</th>
              <th className="px-3 py-2 text-right font-semibold">Min speed</th>
              <th className="px-3 py-2 text-right font-semibold">Lean</th>
              <th className="px-3 py-2 text-right font-semibold">Transfer</th>
              <th className="px-3 py-2 font-semibold">What happened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, ref, sub, dTime, dScore, dSpeed, dLean, dLoad, payoff }) => {
              // A turn outside the subject's common section has values — they are
              // just measured on different tarmac. Printing them next to a "—" for
              // time invites exactly the comparison the mask exists to prevent.
              const off = payoff === 'unmeasured';
              return (
              <tr
                key={c.turn}
                onClick={() => onSelectTurn(c.s)}
                className={`cursor-pointer border-b border-zinc-800/60 text-[13px] transition-colors last:border-0 hover:bg-zinc-800/40 ${
                  activeTurn === c.turn ? 'bg-[#12161c]' : ''
                } ${off ? 'opacity-50' : ''}`}
              >
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span
                      className="flex h-[22px] w-[22px] items-center justify-center rounded-md font-mono text-[11px] font-bold text-zinc-950"
                      style={{ background: off ? '#52525b' : scoreColor((sub?.apexScore ?? 0) / 100, anchorG) }}
                    >
                      {c.turn}
                    </span>
                    <span className="text-[11px] text-zinc-500">{c.dir === 'L' ? 'Left' : 'Right'}</span>
                  </span>
                </td>
                <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${deltaTextClass(dTime)}`}>
                  {sameLap || off ? '—' : `${formatDelta(dTime)}s`}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-300">
                  {off ? '—' : Math.round(sub?.apexScore ?? 0)}
                  {!sameLap && !off && Number.isFinite(dScore) && (
                    <span className={`ml-1.5 text-[11px] ${deltaTextClass(-dScore, 3)}`}>
                      {formatDelta(dScore, 0)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-300">
                  {off ? '—' : Math.round((sub?.minSpeed ?? 0) * 3.6)}
                  {!sameLap && !off && (
                    <span className={`ml-1.5 text-[11px] ${deltaTextClass(-dSpeed, 1)}`}>
                      {formatDelta(dSpeed, 0)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-400">
                  {off ? '—' : `${Math.round(sub?.maxLean ?? 0)}°`}
                  {!sameLap && !off && <span className="ml-1.5 text-[11px] text-zinc-500">{formatDelta(dLean, 0)}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-400">
                  {off ? '—' : (sub?.peakLoad ?? 0).toFixed(1)}
                  {!sameLap && !off && <span className="ml-1.5 text-[11px] text-zinc-500">{formatDelta(dLoad, 1)}</span>}
                </td>
                <td className={`px-3 py-2.5 text-[12px] ${PAYOFF_STYLE[payoff]}`} title={PAYOFF_HINT[payoff]}>
                  {sameLap ? `ref ${Math.round(ref?.apexScore ?? 0)} pts` : PAYOFF_LABEL[payoff]}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-zinc-600">
        Demand is a score: g × 100, so 110 ≈ 1.10 g. Δ columns are the subject lap minus the reference, measured over
        the same stretch of track on both laps.
      </p>
    </section>
  );
}
