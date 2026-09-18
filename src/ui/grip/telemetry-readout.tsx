import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { frontWeightFraction } from '@/analysis/grip/load';
import type { GripSettings } from '@/analysis/grip/settings';
import { CrossRefReadout, Readout, usePlateInk } from '@/ui/plate';
import type { GripMetricMode } from './metric-mode';
import { metricModeName } from './metric-mode';
import { rateColor, scoreColor } from './colors';

interface TelemetryReadoutProps {
  analysis: GripAnalysis;
  lap: GripLap;
  /** local sample index the whole plate is cross-referenced to */
  cursor: number;
  metric: ArrayLike<number>;
  mode: GripMetricMode;
  settings: Pick<GripSettings, 'K' | 'tau' | 'rateFS' | 'anchorG'>;
}

/**
 * What the plate reads at one instant. The channel line is the shared
 * cross-reference readout, so the plan view, the profile view and the traction
 * circle all report this same sample: three views of one procedure, never three
 * charts with private hover states.
 */
export function TelemetryReadout({ analysis, lap, cursor, metric, mode, settings }: TelemetryReadoutProps) {
  const ink = usePlateInk();
  const d = analysis;
  const ci = Math.max(lap.start, Math.min(lap.end, lap.start + cursor));
  const u = metric[ci];
  const lean = d.leanS[ci];
  const along = d.along[ci];
  const front = frontWeightFraction(d.alongRaw[ci], settings.K);
  const frontPct = Math.round(front * 100);
  const rearPct = 100 - frontPct;
  const lr = d.loadRate[ci];
  const nlr = Math.min(1, lr / settings.rateFS);
  const tCur = d.ch.t[ci] - d.ch.t[lap.start];
  const fmt = (v: number, dp = 0) => Number.isFinite(v) ? v.toFixed(dp) : 'n/a';
  const demandInk = scoreColor(ink, u, settings.anchorG);

  return (
    <div>
      <div className="rule-b">
        <CrossRefReadout
          axisLabel="Lap time"
          axisValue={`${tCur.toFixed(2)} s`}
          channels={[
            { name: 'Speed', value: fmt(d.spdS[ci] * 3.6), unit: 'km/h' },
            {
              name: 'Lean',
              value: `${fmt(Math.abs(lean))}°${lean < 0 ? ' L' : lean > 0 ? ' R' : ''}`,
            },
            { name: 'Lat g', value: fmt(Math.abs(d.alat[ci]), 2), unit: 'g' },
            {
              name: 'Long g',
              value: `${along >= 0 ? '+' : ''}${fmt(along, 2)}`,
              unit: along >= 0 ? 'g drive' : 'g brake',
            },
            { name: 'Demand rate', value: fmt(lr, 2), unit: 'g/s', color: rateColor(ink, nlr) },
          ]}
        />
      </div>

      <div className="rule-b px-3 py-2.5">
        <Readout
          value={fmt(u * 100)}
          unit="pts"
          label={metricModeName(mode)}
        />
        {/* the bar is the only place the demand ramp appears as a value, so the
            reader can match the track map's colour to a number */}
        <div
          className="mt-2 h-2.5"
          style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)', background: 'var(--color-sheet)' }}
          role="presentation"
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, ((Number.isFinite(u) ? u : 0) / (settings.anchorG || 1)) * 100))}%`,
              height: '100%',
              background: demandInk,
            }}
          />
        </div>
      </div>

      <div className="px-3 py-2.5">
        {(front === 0 || front === 1) && <p className="t-annotation">Weight-split model limit reached.</p>}
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-annotation">
            Rear <span className="t-data ml-1 text-sm">{fmt(rearPct)}%</span>
          </span>
          <span className="t-annotation">Estimated split</span>
          <span className="t-annotation">
            <span className="t-data mr-1 text-sm">{fmt(frontPct)}%</span> Front
          </span>
        </div>
        {/* Hue would only decorate here: the filled length is the rear share,
            the empty remainder the front, and the centre rule is 50/50. */}
        <div
          className="relative mt-1.5 h-3"
          style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)', background: 'var(--color-sheet)' }}
        >
          <div
            style={{ width: `${fmt(rearPct)}%`, height: '100%', background: 'var(--color-ink-3)' }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-1/2"
            style={{ width: 1, background: 'var(--color-ink)' }}
          />
        </div>
      </div>
    </div>
  );
}
