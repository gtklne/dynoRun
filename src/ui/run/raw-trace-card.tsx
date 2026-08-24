import { useMemo } from 'react';
import { buildRawTrace, accelInG } from '@/analysis/raw-trace';
import { PEAK_ACCEL_SUSPICIOUS_MS2 } from '@/analysis/run-quality';
import type { RawSpeedSample } from '@/analysis/types';
import { RawSpeedChart } from '@/ui/components/raw-speed-chart';

// Below this the fix rate is too coarse for a derivative to mean much: the
// smoothing window spans about one real fix, so it filters interpolation
// rather than data and the curve is the raw difference quotient in disguise.
const MIN_USEFUL_FIX_RATE_HZ = 2;

interface Props {
  samples: RawSpeedSample[];
}

interface Warning {
  key: string;
  text: string;
}

function Stat({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone: 'ok' | 'warn';
}) {
  return (
    <div>
      <p className="text-zinc-500 text-[11px] uppercase tracking-wider">{label}</p>
      <p className={`tabular-nums font-bold text-lg ${tone === 'warn' ? 'text-red-400' : 'text-zinc-100'}`}>
        {value}
      </p>
      {sub && <p className="text-zinc-600 text-[11px] tabular-nums">{sub}</p>}
    </div>
  );
}

/**
 * Speed as the GPS actually reported it, fix by fix, next to the trace the
 * pipeline derived power from.
 *
 * This exists because a power curve is a plausible-looking picture no matter
 * how bad its input is: a receiver that freezes a speed value for one second
 * and catches up in the next reads as double the real acceleration, and the
 * curve absorbs that silently at the top end, which is exactly where the peak
 * is quoted from. Plotting the raw fixes is the only view where that failure
 * is visible rather than inferred.
 */
export function RawTraceCard({ samples }: Props) {
  const trace = useMemo(() => buildRawTrace(samples), [samples]);

  const warnings: Warning[] = [];
  if (trace.points.length > 1 && trace.fix_rate_hz < MIN_USEFUL_FIX_RATE_HZ) {
    warnings.push({
      key: 'rate',
      text: `GPS delivered ${trace.fix_rate_hz.toFixed(1)} fixes per second, so this whole run is ${trace.points.length} readings. Smoothing cannot recover detail that was never sampled, and the curve is close to the raw fix-to-fix differences.`,
    });
  }
  if (trace.frozen_count > 0) {
    warnings.push({
      key: 'frozen',
      text: `${trace.frozen_count} ${trace.frozen_count === 1 ? 'fix repeats' : 'fixes repeat'} the previous speed exactly. The receiver held a stale value and then caught up in one step, which differentiates to roughly twice the real acceleration.`,
    });
  }
  if (trace.spike_count > 0) {
    warnings.push({
      key: 'spike',
      text: `${trace.spike_count} ${trace.spike_count === 1 ? 'step exceeds' : 'steps exceed'} ${PEAK_ACCEL_SUSPICIOUS_MS2} m/s² (${accelInG(PEAK_ACCEL_SUSPICIOUS_MS2).toFixed(2)} g), past what a road tyre can deliver. Whatever peak sits on those fixes is the signal, not the vehicle.`,
    });
  }
  if (trace.gap_count > 0) {
    warnings.push({
      key: 'gap',
      text: `${trace.gap_count} ${trace.gap_count === 1 ? 'gap runs' : 'gaps run'} well past this run's own ${(trace.median_gap_ms / 1000).toFixed(1)} s fix spacing. Resampling interpolates straight across a dropout, which invents a steady ramp where there was no measurement.`,
    });
  }

  const trailing = trace.points.length - 1 - trace.trim_index;
  const rateWarn = trace.points.length > 1 && trace.fix_rate_hz < MIN_USEFUL_FIX_RATE_HZ;
  const spikeWarn = trace.peak_raw_accel_ms2 > PEAK_ACCEL_SUSPICIOUS_MS2;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold text-zinc-200">Raw GPS trace</h2>
        <p className="text-zinc-500 text-xs mt-0.5">
          Every speed the receiver reported, before any filtering. The pale dashed line is what
          the pipeline derived power from: where it sits on top of the raw trace, smoothing
          changed nothing.
        </p>
      </div>

      <div className="p-2">
        <RawSpeedChart trace={trace} accelCeilingMs2={PEAK_ACCEL_SUSPICIOUS_MS2} />
      </div>

      <div className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Fixes" value={String(trace.points.length)} tone="ok" />
          <Stat
            label="Fix rate"
            value={`${trace.fix_rate_hz.toFixed(1)} Hz`}
            sub={rateWarn ? `below ${MIN_USEFUL_FIX_RATE_HZ} Hz` : undefined}
            tone={rateWarn ? 'warn' : 'ok'}
          />
          <Stat
            label="Repeated"
            value={String(trace.frozen_count)}
            sub="stale speed values"
            tone={trace.frozen_count > 0 ? 'warn' : 'ok'}
          />
          <Stat
            label="Peak step"
            value={`${trace.peak_raw_accel_ms2.toFixed(1)} m/s²`}
            sub={`${accelInG(trace.peak_raw_accel_ms2).toFixed(2)} g`}
            tone={spikeWarn ? 'warn' : 'ok'}
          />
        </div>

        {trailing > 0 && (
          <p className="text-zinc-500 text-xs">
            The pipeline used the first {trace.trim_index + 1} of {trace.points.length} fixes. It
            cuts at peak speed, so the {trailing} after it were recorded but never analysed.
          </p>
        )}

        {warnings.length > 0 ? (
          <ul className="space-y-2 pt-1">
            {warnings.map((w) => (
              <li key={w.key} className="text-xs text-zinc-300 flex gap-2">
                <span className="text-red-400 shrink-0">!</span>
                <span>{w.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-emerald-400 text-xs">
            No frozen fixes, dropouts, or impossible steps. The speed signal supports this curve.
          </p>
        )}
      </div>
    </div>
  );
}
