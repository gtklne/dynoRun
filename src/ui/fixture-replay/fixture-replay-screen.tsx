import { useState } from 'react';
import { analyzeRun } from '@/analysis/pipeline';
import { computeRollout } from '@/storage/repositories/calibration-repository';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import type { AnalyzedRun } from '@/analysis/types';

interface Fixture {
  calibration: { rpm: number; speed_kmh: number };
  vehicle_mass_kg: number;
  samples: { t_ms: number; speed_mps: number }[];
}

export function FixtureReplayScreen() {
  const [result, setResult] = useState<AnalyzedRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const f = JSON.parse(text) as Fixture;
      const rollout = computeRollout(f.calibration.rpm, f.calibration.speed_kmh);
      const r = analyzeRun({
        samples: f.samples,
        mass_kg: f.vehicle_mass_kg,
        rollout_m_per_rev: rollout,
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section>
      <h1>Fixture replay</h1>
      <p>Upload a JSON fixture (calibration, mass, speed samples) to see the derived power curve.</p>
      <input type="file" accept="application/json" onChange={onFile} />
      {error && <pre style={{ color: 'crimson' }}>{error}</pre>}
      {result && (
        <>
          <h2>Power curve ({result.rpm_min.toFixed(0)} – {result.rpm_max.toFixed(0)} RPM)</h2>
          <PowerCurveChart points={result.points} />
          <p>{result.points.length} binned points · pipeline v{result.pipeline_version}</p>
        </>
      )}
    </section>
  );
}
