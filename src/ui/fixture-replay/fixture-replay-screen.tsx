import { useState } from 'react';
import { analyzeRun } from '@/analysis/pipeline';
import { computeRollout } from '@/shared/units';
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
  const [filename, setFilename] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Fixture replay</h1>
        <p className="text-zinc-500 text-sm mt-1">Analyze a JSON run fixture offline</p>
      </div>

      {/* Upload zone */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <p className="text-zinc-400 text-sm mb-4">
          Upload a JSON file with calibration data, vehicle mass, and speed samples to see the derived power curve.
        </p>
        <label className="flex flex-col items-center gap-3 border-2 border-dashed border-zinc-700 rounded-xl p-6 cursor-pointer hover:border-zinc-500 transition-colors">
          <svg className="text-zinc-500" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 16 12 12 8 16"/>
            <line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
          <div className="text-center">
            <p className="text-zinc-300 text-sm font-medium">
              {filename ?? 'Choose a fixture file'}
            </p>
            <p className="text-zinc-600 text-xs mt-1">JSON format</p>
          </div>
          <input type="file" accept="application/json" onChange={onFile} className="sr-only" />
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-4">
          <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-2">Error</p>
          <pre className="text-red-300 text-xs overflow-x-auto whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">RPM range</p>
              <p className="text-zinc-100 font-semibold text-sm tabular-nums">
                {result.rpm_min.toFixed(0)} – {result.rpm_max.toFixed(0)}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Data points</p>
              <p className="text-zinc-100 font-semibold text-sm">{result.points.length} bins</p>
              <p className="text-zinc-600 text-xs mt-0.5">pipeline v{result.pipeline_version}</p>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
            <PowerCurveChart series={[{ label: 'Power', points: result.points }]} />
          </div>
        </div>
      )}
    </div>
  );
}
