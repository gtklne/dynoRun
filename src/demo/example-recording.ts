import type { RawSpeedSample } from '@/analysis/types';

export interface DemoRecording {
  vehicle_label: string;
  gear_label: string;
  vehicle_mass_kg: number;
  calibration: { rpm: number; speed_kmh: number };
  recorded_at: string;
  duration_ms: number;
  samples: RawSpeedSample[];
}

// Synthetic constant-acceleration profile chosen so the resulting curve covers
// a believable rev band (≈600–5400 RPM at rollout 0.5 m/rev) without needing a
// real recording bundled in the repo.
function generateSamples(): RawSpeedSample[] {
  const samples: RawSpeedSample[] = [];
  const STEP_MS = 100;
  const ACCEL_PHASE_MS = 10_000;
  const COAST_PHASE_MS = 2_000;
  const TOTAL_MS = ACCEL_PHASE_MS + COAST_PHASE_MS;
  const START_MPS = 5.0;
  const ACCEL_MS2 = 4.0;
  // Peak speed at end of accel phase = 5 + 4*10 = 45 m/s.
  const PEAK_MPS = START_MPS + (ACCEL_MS2 * ACCEL_PHASE_MS) / 1000;
  const COAST_DECEL_MS2 = 1.5;

  for (let t = 0; t <= TOTAL_MS; t += STEP_MS) {
    let speed: number;
    if (t <= ACCEL_PHASE_MS) {
      speed = START_MPS + ACCEL_MS2 * (t / 1000);
    } else {
      const dt = (t - ACCEL_PHASE_MS) / 1000;
      speed = Math.max(0, PEAK_MPS - COAST_DECEL_MS2 * dt);
    }
    samples.push({ t_ms: t, speed_mps: speed });
  }
  return samples;
}

export const DEMO_RECORDING: DemoRecording = {
  vehicle_label: 'Example Track Day Car',
  gear_label: '3rd',
  vehicle_mass_kg: 1500,
  calibration: { rpm: 3000, speed_kmh: 90 },
  recorded_at: '2026-01-01T10:00:00.000Z',
  duration_ms: 12_000,
  samples: generateSamples(),
};
