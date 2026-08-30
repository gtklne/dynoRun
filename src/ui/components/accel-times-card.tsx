import type { AccelTimes, AccelInterval } from '@/analysis/accel-times';
import { MinimaTable, Na, Readout, Zone, type MinimaColumn } from '@/ui/plate';

interface AccelTimesCardProps {
  accel: AccelTimes;
}

const ZERO_TO_HUNDRED_LABEL = '0-100 km/h';

function isZeroToHundred(interval: AccelInterval): boolean {
  return interval.from_kmh === 0 && interval.to_kmh === 100;
}

const COLUMNS: MinimaColumn<AccelInterval>[] = [
  { key: 'label', head: 'Interval', cell: (iv) => iv.label },
  {
    key: 'elapsed',
    head: 'Elapsed (s)',
    numeric: true,
    cell: (iv) => iv.elapsed_s.toFixed(1),
  },
];

/**
 * Acceleration times as a minima table, not a grid of tiles: they are a set of
 * comparable readings against one axis, which is exactly what the plate's
 * decision table is for. The 0-100 figure is the one number a driver quotes,
 * so it is lifted out as the readout and the rest stay in the table.
 */
export function AccelTimesCard({ accel }: AccelTimesCardProps) {
  const hero = accel.intervals.find(isZeroToHundred) ?? null;
  const others = accel.intervals.filter((i) => !isZeroToHundred(i));
  const hasContent = accel.intervals.length > 0 || accel.quarter_mile != null;

  if (!hasContent) return null;

  return (
    <Zone label="Acceleration" note={`peak ${accel.peak_speed_kmh.toFixed(0)} km/h`}>
      {hero && (
        <div className="rule-b px-3 py-3">
          <Readout
            value={hero.elapsed_s.toFixed(1)}
            unit="s"
            label={ZERO_TO_HUNDRED_LABEL}
            tone="procedure"
          />
        </div>
      )}

      {others.length > 0 && (
        <MinimaTable columns={COLUMNS} rows={others} rowKey={(iv) => iv.label} />
      )}

      {accel.quarter_mile && (
        <dl className="rule-t grid grid-cols-2">
          <div className="px-3 py-2.5">
            <dt className="t-annotation">Quarter mile</dt>
            <dd className="t-data mt-1 text-lg">
              {accel.quarter_mile.elapsed_s.toFixed(1)}
              <span className="t-annotation ml-1">s</span>
            </dd>
          </div>
          <div className="rule-l px-3 py-2.5">
            <dt className="t-annotation">Trap speed</dt>
            <dd className="t-data mt-1 text-lg">
              {accel.quarter_mile.trap_speed_kmh.toFixed(0)}
              <span className="t-annotation ml-1">km/h</span>
            </dd>
          </div>
        </dl>
      )}

      {!hero && others.length === 0 && !accel.quarter_mile && (
        <p className="px-3 py-4">
          <Na title="No interval was crossed in this run" />
        </p>
      )}
    </Zone>
  );
}
