import type { RawSpeedSample } from './types';
import { buildRawTrace, type RawTrace, type RawTracePoint } from './raw-trace';
import { PEAK_ACCEL_SUSPICIOUS_MS2 } from './run-quality';
import { accelInG } from './raw-trace';

// A frozen fix only matters if the vehicle was actually accelerating through
// it. Held at a cruise it costs nothing; held mid-pull it means a whole second
// of the pull went unmeasured and its speed gain lands on the NEXT interval,
// which then reads up to twice the real acceleration. Below this the vehicle
// was coasting or holding and the repeat is harmless.
export const STALL_CATCHUP_MS2 = 2;

export type IntegrityVerdict = 'ok' | 'suspect' | 'corrupt';

export type IntegrityFaultKind = 'impossible_step' | 'stall_and_catchup' | 'dropout';

export interface IntegrityFault {
  kind: IntegrityFaultKind;
  t_ms: number;
  // Inside the window the pipeline actually analysed. A fault outside it did
  // not feed the curve, so it lowers confidence without condemning the number.
  analysed: boolean;
  detail: string;
}

export interface SignalIntegrity {
  verdict: IntegrityVerdict;
  faults: IntegrityFault[];
  // One line for a badge, and the action to take. Kept here rather than in the
  // components because two screens show this (pull picker and run review) and
  // they must not word the same verdict differently.
  headline: string;
  advice: string;
  trace: RawTrace;
}

/**
 * Is this run's speed signal fit to carry a power number?
 *
 * Separate from run-quality, which scores how *good* a run is. This asks the
 * blunter question: did the receiver fabricate the answer? Peak power is a MAX
 * over RPM bins, so a single over-read bin always becomes the headline no
 * matter where in the pull it sits. That is why one bad fix condemns the whole
 * run rather than merely widening its error bar, and why the right advice is
 * to ride it again rather than to read the number with caution.
 */
export function assessSignal(samples: RawSpeedSample[]): SignalIntegrity {
  const trace = buildRawTrace(samples);
  const faults: IntegrityFault[] = [];

  trace.points.forEach((p, i) => {
    const next: RawTracePoint | undefined = trace.points[i + 1];

    if (p.flags.includes('spike') && p.accel_ms2 != null) {
      faults.push({
        kind: 'impossible_step',
        t_ms: p.t_ms,
        analysed: p.used,
        detail: `${p.accel_ms2.toFixed(1)} m/s² (${accelInG(p.accel_ms2).toFixed(2)} g) between two fixes, past what a tyre can deliver`,
      });
    }

    if (
      p.flags.includes('frozen') &&
      next?.accel_ms2 != null &&
      next.accel_ms2 > STALL_CATCHUP_MS2
    ) {
      faults.push({
        kind: 'stall_and_catchup',
        // Blame the catch-up fix, not the frozen one: that is the sample whose
        // reading is wrong, and the one a chart cursor should land on.
        t_ms: next.t_ms,
        analysed: p.used || next.used,
        detail: `speed held at ${(p.speed_mps * 3.6).toFixed(0)} km/h for a second, then jumped ${next.accel_ms2.toFixed(1)} m/s²`,
      });
    }

    if (p.flags.includes('gap') && p.dt_ms != null) {
      faults.push({
        kind: 'dropout',
        t_ms: p.t_ms,
        analysed: p.used,
        detail: `${(p.dt_ms / 1000).toFixed(1)} s with no fix, against a ${(trace.median_gap_ms / 1000).toFixed(1)} s cadence`,
      });
    }
  });

  const fabricating = faults.filter(
    (f) => f.analysed && (f.kind === 'impossible_step' || f.kind === 'stall_and_catchup'),
  );

  if (fabricating.length > 0) {
    return {
      verdict: 'corrupt',
      faults,
      headline:
        fabricating.length === 1
          ? 'GPS drift corrupted this pull'
          : `GPS drift corrupted this pull (${fabricating.length} bad fixes)`,
      advice:
        'The receiver lost the speed signal mid-pull and caught up in one step, which reads as acceleration the vehicle never made. Peak power is the highest bin in the run, so a single fabricated step becomes the headline. Discard this one and ride the pull again.',
      trace,
    };
  }

  if (faults.length > 0) {
    return {
      verdict: 'suspect',
      faults,
      headline: 'GPS glitches outside the measured window',
      advice:
        'The receiver misbehaved during the ride, but not inside the stretch this curve was derived from. The number stands, though it is worth a second pull to confirm.',
      trace,
    };
  }

  return {
    verdict: 'ok',
    faults,
    headline: 'Speed signal is intact',
    advice: 'No frozen fixes, dropouts, or impossible steps in the measured window.',
    trace,
  };
}

/** Grip-limit ceiling a step is judged against, re-exported so UIs quote one number. */
export { PEAK_ACCEL_SUSPICIOUS_MS2 };
