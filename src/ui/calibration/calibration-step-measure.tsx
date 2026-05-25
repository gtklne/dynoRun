import { useEffect, useRef, useState } from 'react';
import { calibrationRepository } from '@/api/repositories/calibration-repository';
import { CalibrationController, type CalibrationLiveSample } from '@/run/calibration-controller';
import { useSpeedSourceFactory } from './speed-source-context';
import type { GearInput } from './calibration-step-gear';
import type { Calibration } from '@/shared/types';
import type { CalibrationState } from '@/run/types';
import { setLastRecording } from '@/sensors/replay-state';
import { recordingRepository } from '@/api/repositories/recording-repository';

interface Props {
  vehicleId: string;
  gear: GearInput;
  onConfirmed: (cal: Calibration) => void;
  onCancel: () => void;
}

function headingLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function qualityColor(q: number): string {
  if (q >= 0.7) return 'text-emerald-400';
  if (q >= 0.4) return 'text-amber-400';
  return 'text-red-400';
}

function accuracyColor(m: number | null): string {
  if (m === null) return 'text-zinc-500';
  if (m <= 5) return 'text-emerald-400';
  if (m <= 15) return 'text-amber-400';
  return 'text-red-400';
}

interface TelemetryRowProps {
  label: string;
  value: string;
  unit?: string;
  valueClass?: string;
}

function TelemetryRow({ label, value, unit, valueClass = 'text-zinc-100' }: TelemetryRowProps) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-zinc-800/60 last:border-0">
      <span className="text-zinc-500 text-xs uppercase tracking-wider font-medium">{label}</span>
      <span className={`tabular-nums text-sm font-mono font-semibold ${valueClass}`}>
        {value}
        {unit && <span className="text-zinc-500 text-xs font-normal ml-1">{unit}</span>}
      </span>
    </div>
  );
}

// Mutable fusion state kept in a ref — no re-renders from motion events directly.
interface FusionState {
  lastGpsSpeed_mps: number;
  intX: number; intY: number; intZ: number;
  lastMotionTime: number;
  // Unit vector pointing "forward" in device space. Updated after each GPS fix.
  forwardAxis: [number, number, number];
}

function initialFusion(): FusionState {
  return { lastGpsSpeed_mps: 0, intX: 0, intY: 0, intZ: 0, lastMotionTime: 0, forwardAxis: [0, 1, 0] };
}

// Picks the cardinal axis whose integral best matches targetDelta, blended into current axis.
function adaptAxis(f: FusionState, delta_mps: number): void {
  const { intX, intY, intZ, forwardAxis: [ox, oy, oz] } = f;
  const candidates: Array<{ axis: [number, number, number]; err: number }> = [
    { axis: [1, 0, 0], err: Math.abs(intX - delta_mps) },
    { axis: [-1, 0, 0], err: Math.abs(-intX - delta_mps) },
    { axis: [0, 1, 0], err: Math.abs(intY - delta_mps) },
    { axis: [0, -1, 0], err: Math.abs(-intY - delta_mps) },
    { axis: [0, 0, 1], err: Math.abs(intZ - delta_mps) },
    { axis: [0, 0, -1], err: Math.abs(-intZ - delta_mps) },
  ];
  candidates.sort((a, b) => a.err - b.err);
  const [nx, ny, nz] = candidates[0].axis;
  const k = 0.3;
  const bx = ox + (nx - ox) * k, by = oy + (ny - oy) * k, bz = oz + (nz - oz) * k;
  const len = Math.sqrt(bx * bx + by * by + bz * bz);
  if (len > 0.001) f.forwardAxis = [bx / len, by / len, bz / len];
}

export function CalibrationStepMeasure({ vehicleId, gear, onConfirmed, onCancel }: Props) {
  const speedSourceFactory = useSpeedSourceFactory();
  const [state, setState] = useState<CalibrationState>({ kind: 'idle' });
  const [live, setLive] = useState<CalibrationLiveSample | null>(null);
  // High-frequency fused speed for display; kept separate from live to avoid
  // flooding React re-renders from the GPS-only onLiveSample path.
  const [displaySpeed, setDisplaySpeed] = useState<number | null>(null);
  const ctrlRef = useRef<CalibrationController | null>(null);
  const fusionRef = useRef<FusionState>(initialFusion());

  // DeviceMotion listener: active only while measuring, integrates acceleration
  // between GPS fixes to give a high-frequency speed estimate.
  useEffect(() => {
    if (state.kind !== 'measuring') return;

    const handler = (e: DeviceMotionEvent) => {
      const f = fusionRef.current;
      const a = e.acceleration;
      if (!a) return;

      const now = performance.now();
      const dt = f.lastMotionTime > 0 ? (now - f.lastMotionTime) / 1000 : 0;
      f.lastMotionTime = now;
      if (dt <= 0 || dt > 0.5) return;

      f.intX += (a.x ?? 0) * dt;
      f.intY += (a.y ?? 0) * dt;
      f.intZ += (a.z ?? 0) * dt;

      const [fx, fy, fz] = f.forwardAxis;
      const correction = f.intX * fx + f.intY * fy + f.intZ * fz;
      // Cap drift at ±8 m/s (~29 km/h) from the last GPS fix.
      const speed_kmh = Math.max(0, (f.lastGpsSpeed_mps + Math.max(-8, Math.min(8, correction))) * 3.6);
      setDisplaySpeed(speed_kmh);
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [state.kind]);

  useEffect(() => {
    return () => {
      ctrlRef.current?.stop().catch(() => {});
      ctrlRef.current = null;
    };
  }, []);

  async function start() {
    // iOS 13+ requires a user-gesture permission request for DeviceMotionEvent.
    const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DME.requestPermission === 'function') {
      try { await DME.requestPermission(); } catch { /* fall back to GPS-only */ }
    }

    fusionRef.current = initialFusion();

    const sensor = await speedSourceFactory();
    const ctrl = new CalibrationController({
      vehicleId,
      speedSource: sensor,
      calibrationRepository,
      onStateChange: setState,
      onLiveSample: (sample) => {
        const f = fusionRef.current;
        const newSpeed_mps = sample.speed_kmh / 3.6;
        const delta = newSpeed_mps - f.lastGpsSpeed_mps;

        // Update forward-axis estimate whenever the speed changed meaningfully.
        if (Math.abs(delta) > 0.3) adaptAxis(f, delta);

        // Reset integrals so the next motion window starts from this GPS baseline.
        f.intX = 0; f.intY = 0; f.intZ = 0;
        f.lastGpsSpeed_mps = newSpeed_mps;

        setLive(sample);
        setDisplaySpeed(sample.speed_kmh);
      },
      onRecordingFinished: (rec) => {
        setLastRecording(rec);
        recordingRepository.create({
          kind: rec.kind,
          vehicle_id: rec.meta.vehicle_id ?? null,
          calibration_id: rec.meta.calibration_id ?? null,
          run_id: rec.meta.run_id ?? null,
          gear_label: rec.meta.gear_label ?? null,
          user_rpm: rec.meta.user_rpm ?? null,
          label: rec.meta.label ?? null,
          recorded_at: rec.recorded_at,
          duration_ms: Math.round(rec.duration_ms),
          data: { gps_fixes: rec.gps_fixes, motion_fixes: rec.motion_fixes },
        }).catch((err) => {
          console.error('Failed to upload recording:', err);
        });
      },
    });
    ctrlRef.current = ctrl;
    await ctrl.start({ gear_label: gear.gear_label, user_rpm: gear.user_rpm });
  }

  async function confirm() {
    if (!ctrlRef.current) return;
    const cal = await ctrlRef.current.confirm();
    await ctrlRef.current.stop();
    onConfirmed(cal);
  }

  const stabilityPct = live ? Math.min(1, live.stability.elapsed_ms / live.stability.window_ms) : 0;
  const deltaOk = live ? live.stability.speed_delta_kmh <= live.stability.max_delta_kmh : false;

  return (
    <div className="space-y-5">
      {/* Instruction card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-1">
        <p className="text-zinc-100 font-medium text-sm">
          Hold steady at {gear.user_rpm.toLocaleString()} RPM in {gear.gear_label}
        </p>
        <p className="text-zinc-500 text-xs">
          Cruise at a constant speed in {gear.gear_label} gear. The app captures your speed when it stabilizes.
        </p>
      </div>

      {/* Idle state */}
      {state.kind === 'idle' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
            <svg className="text-zinc-500" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <p className="text-zinc-500 text-sm">Ready when you are</p>
        </div>
      )}

      {/* Measuring state — telemetry debug panel */}
      {state.kind === 'measuring' && (
        <div className="bg-zinc-900 border border-amber-800/40 rounded-2xl overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/60">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-amber-400 text-xs font-semibold uppercase tracking-widest">Measuring</span>
          </div>

          {/* Big speed readout */}
          <div className="px-4 pt-4 pb-3 border-b border-zinc-800">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Current Speed</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tabular-nums text-zinc-100 font-mono">
                {displaySpeed != null ? displaySpeed.toFixed(1) : '—'}
              </span>
              <span className="text-lg text-zinc-500">km/h</span>
            </div>
          </div>

          {/* GPS telemetry rows */}
          <div className="px-4 py-1 border-b border-zinc-800">
            <p className="text-zinc-600 text-xs uppercase tracking-wider pt-2 pb-1">GPS Signal</p>
            <TelemetryRow
              label="Accuracy"
              value={live?.accuracy_m != null ? live.accuracy_m.toFixed(1) : '—'}
              unit="m"
              valueClass={accuracyColor(live?.accuracy_m ?? null)}
            />
            <TelemetryRow
              label="Signal Quality"
              value={live ? Math.round(live.quality * 100).toString() : '—'}
              unit="%"
              valueClass={live ? qualityColor(live.quality) : 'text-zinc-500'}
            />
            <TelemetryRow
              label="Fix Rate"
              value={live?.fix_rate_hz != null ? live.fix_rate_hz.toFixed(1) : '—'}
              unit="Hz"
            />
            {live?.altitude_m != null && (
              <TelemetryRow
                label="Altitude"
                value={live.altitude_m.toFixed(0)}
                unit="m"
              />
            )}
            {live?.heading_deg != null && (
              <TelemetryRow
                label="Heading"
                value={`${live.heading_deg.toFixed(0)}° ${headingLabel(live.heading_deg)}`}
              />
            )}
          </div>

          {/* Stability progress */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-zinc-600 text-xs uppercase tracking-wider">Stability</p>
              <span className="text-zinc-500 text-xs font-mono tabular-nums">
                {live ? (live.stability.elapsed_ms / 1000).toFixed(1) : '0.0'}s / {live ? (live.stability.window_ms / 1000).toFixed(0) : '5'}s
              </span>
            </div>

            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${deltaOk ? 'bg-amber-500' : 'bg-red-700'}`}
                style={{ width: `${stabilityPct * 100}%` }}
              />
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-zinc-600 text-xs">Speed Δ</span>
              <span className={`text-xs font-mono tabular-nums font-semibold ${deltaOk ? 'text-emerald-400' : 'text-red-400'}`}>
                {live ? `±${(live.stability.speed_delta_kmh / 2).toFixed(2)} km/h` : '—'}
                <span className="text-zinc-600 font-normal ml-1">
                  (max ±{live ? (live.stability.max_delta_kmh / 2).toFixed(1) : '0.5'})
                </span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Stable / captured state */}
      {state.kind === 'stable' && (
        <div className="bg-zinc-900 border border-emerald-800/40 rounded-2xl p-6 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="text-emerald-400" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-zinc-400 text-xs uppercase tracking-wider mb-1">Captured speed</p>
            <p className="text-4xl font-bold text-zinc-100 tabular-nums">
              {state.captured_speed_kmh.toFixed(1)}
              <span className="text-lg font-normal text-zinc-400 ml-1">km/h</span>
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        {state.kind === 'idle' && (
          <button
            onClick={start}
            className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold py-3.5 rounded-xl transition-colors"
          >
            Start measurement
          </button>
        )}
        {state.kind === 'stable' && (
          <button
            onClick={confirm}
            className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            Save calibration
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-3 rounded-xl transition-colors border border-zinc-700 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
