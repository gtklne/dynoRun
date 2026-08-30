import { useMemo } from 'react';
import { buildRawTrace, accelInG } from '@/analysis/raw-trace';
import { PEAK_ACCEL_SUSPICIOUS_MS2 } from '@/analysis/run-quality';
import type { RawSpeedSample } from '@/analysis/types';
import { RawSpeedChart } from '@/ui/components/raw-speed-chart';
import { ProfileView } from '@/ui/plate';

// Below this the fix rate is too coarse for a derivative to mean much: the
// smoothing window spans about one real fix, so it filters interpolation
// rather than data and the curve is the raw difference quotient in disguise.
//
// Every phone run sits below it, and that is the point of splitting notes from
// warnings. iOS CoreLocation delivers standard location updates at about 1 Hz
// and exposes no way to ask for more (the Capacitor plugin's iOS side takes
// only `enableHighAccuracy`; `interval` is an Android-only option). So a red
// alarm on the fix rate would fire on every run forever, for a constraint no
// rider can act on, and it would sit in the same list as the run-specific
// defects that they CAN act on by re-riding the pull. Warnings are reserved
// for what is wrong with this run; sampling reality is a note.
const MIN_USEFUL_FIX_RATE_HZ = 2;

interface Props {
  samples: RawSpeedSample[];
  /**
   * Seconds into the trace to mark, published by the power curve's cursor.
   * This is the profile half of the plate's cross-reference.
   */
  cursorTimeS?: number | null;
}

interface Note {
  key: string;
  text: string;
}

/**
 * One marginal figure. `data-tone` carries whether the reading is a fault, and
 * a fault here means the number below is the receiver rather than the vehicle,
 * so it takes red. Everything within tolerance stays in plain ink.
 */
function Stat({ label, value, sub, tone }: {
  label: string;
  value: string;
  sub?: string;
  tone: 'ok' | 'warn';
}) {
  return (
    <div className="rule-l px-3 py-2 first:border-l-0">
      <p className="t-annotation">{label}</p>
      <p
        className="t-data mt-0.5 text-lg"
        data-tone={tone}
        style={tone === 'warn' ? { color: 'var(--color-stop)' } : undefined}
      >
        {value}
      </p>
      {sub && <p className="t-annotation mt-0.5">{sub}</p>}
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
export function RawTraceCard({ samples, cursorTimeS = null }: Props) {
  const trace = useMemo(() => buildRawTrace(samples), [samples]);

  const coarse = trace.points.length > 1 && trace.fix_rate_hz < MIN_USEFUL_FIX_RATE_HZ;

  // Context, not a complaint. Rendered calmly and separately from the warnings.
  const notes: Note[] = [];
  if (coarse) {
    notes.push({
      key: 'rate',
      text: `Phone GPS tops out near one fix per second and cannot be asked for more, so this whole run is ${trace.points.length} readings. That is the ceiling, not a fault, but it does mean the curve tracks the raw fix-to-fix differences and its top end rests on the last step or two.`,
    });
  }

  const warnings: Note[] = [];
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
  const spikeWarn = trace.peak_raw_accel_ms2 > PEAK_ACCEL_SUSPICIOUS_MS2;

  return (
    <ProfileView label="Raw GPS trace" axis="speed and fix-to-fix accel vs time (s)">
      <p className="rule-b t-body px-3 py-2 text-[0.8125rem] leading-6">
        Every speed the receiver reported, before any filtering. The dashed line is what the
        pipeline derived power from: where it sits on top of the raw trace, smoothing changed
        nothing.
      </p>

      <div className="rule-b p-1.5">
        <RawSpeedChart
          trace={trace}
          accelCeilingMs2={PEAK_ACCEL_SUSPICIOUS_MS2}
          cursorTimeS={cursorTimeS}
        />
      </div>

      <div className="rule-b grid grid-cols-2 sm:grid-cols-4">
        <Stat label="Fixes" value={String(trace.points.length)} tone="ok" />
        <Stat
          label="Fix rate"
          value={`${trace.fix_rate_hz.toFixed(1)} Hz`}
          sub={coarse ? 'platform ceiling' : undefined}
          tone="ok"
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

      <div className="space-y-2 px-3 py-2.5">
        {trailing > 0 && (
          <p className="t-body text-[0.8125rem] leading-6">
            The pipeline used the first {trace.trim_index + 1} of {trace.points.length} fixes. It
            cuts at peak speed, so the {trailing} after it were recorded but never analysed.
          </p>
        )}

        {warnings.length > 0 && (
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w.key} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2.5 w-2.5 shrink-0"
                  style={{ background: 'var(--color-stop)' }}
                />
                <span className="t-body text-[0.8125rem] leading-6" style={{ color: 'var(--color-ink)' }}>
                  {w.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        {warnings.length === 0 && (
          // At one fix per second a clean signal still cannot pin a peak, so the
          // all-clear has to say what it actually checked rather than bless the
          // number. Promising more here would undo the whole point of the card.
          <p className="t-body text-[0.8125rem] leading-6" style={{ color: 'var(--color-go)' }}>
            {coarse
              ? 'No frozen fixes, dropouts, or impossible steps. Nothing in this signal is fabricated, though at this fix rate the peak is still a coarse read.'
              : 'No frozen fixes, dropouts, or impossible steps. The speed signal supports this curve.'}
          </p>
        )}

        {notes.map((n) => (
          <p key={n.key} className="t-annotation" style={{ lineHeight: 1.6, letterSpacing: '0.04em' }}>
            {n.text}
          </p>
        ))}
      </div>
    </ProfileView>
  );
}
