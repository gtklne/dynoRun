import type { GripAnalysis, GripLap } from '@/analysis/grip/types';
import { frontWeightFraction } from '@/analysis/grip/load';
import type { GripSettings } from '@/analysis/grip/settings';
import type { GripMetricMode } from './metric-mode';
import { metricModeName } from './metric-mode';
import { rateColor, utilColor } from './colors';

interface TelemetryReadoutProps {
  analysis: GripAnalysis;
  lap: GripLap;
  cursor: number;
  metric: ArrayLike<number>;
  mode: GripMetricMode;
  settings: Pick<GripSettings, 'K' | 'tau' | 'rateFS'>;
}

function Stat({ k, v, u, big }: { k: string; v: string; u: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">{k}</div>
      <div className={`font-mono leading-none text-zinc-100 tabular-nums ${big ? 'text-3xl' : 'text-[22px]'}`}>
        {v}
        <span className="text-[11px] text-zinc-500"> {u}</span>
      </div>
    </div>
  );
}

export function TelemetryReadout({ analysis, lap, cursor, metric, mode, settings }: TelemetryReadoutProps) {
  const d = analysis;
  const ci = lap.start + cursor;
  const u = metric[ci];
  const lean = d.leanS[ci];
  const along = d.along[ci];
  const gripPct = Math.round(d.util[ci] * 100);
  const loadPct = Math.round(Math.min(1.3, (settings.tau * d.loadRate[ci]) / d.gref) * 100);
  const front = frontWeightFraction(along, settings.K);
  const frontPct = Math.round(front * 100);
  const rearPct = Math.round((1 - front) * 100);
  const lr = d.loadRate[ci];
  const nlr = Math.min(1, lr / settings.rateFS);

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <Stat k="Speed" v={(d.spdS[ci] * 3.6).toFixed(0)} u="km/h" big />
      <Stat k="Lean" v={Math.abs(lean).toFixed(0)} u={`°${lean < 0 ? ' L' : lean > 0 ? ' R' : ''}`} />
      <Stat k="Lat g" v={Math.abs(d.alat[ci]).toFixed(2)} u="g" />
      <Stat k="Long g" v={`${along >= 0 ? '+' : ''}${along.toFixed(2)}`} u={along >= 0 ? 'g accel' : 'g brake'} />

      <div className="col-span-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
        <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">
          {metricModeName(mode)}
          {mode === 'load' && (
            <span className="normal-case tracking-normal text-zinc-600"> · grip {gripPct} ⊕ load {loadPct}</span>
          )}
        </div>
        <div className="font-mono text-3xl leading-none tabular-nums" style={{ color: utilColor(u) }}>
          {Math.round(u * 100)}
          <span className="text-[11px] text-zinc-500"> %</span>
        </div>
        <div className="relative mt-2 h-2.5 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
          <i
            className="absolute inset-y-0 left-0 rounded-md"
            style={{ width: `${Math.min(100, u * 100)}%`, background: utilColor(u) }}
          />
        </div>
      </div>

      <div className="col-span-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
        <div className="mb-1.5 flex justify-between text-[10.5px] uppercase tracking-wider text-zinc-500">
          <span>
            rear <b className="font-mono text-[13px] normal-case tracking-normal text-zinc-100">{rearPct}%</b>
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-xs normal-case tracking-normal text-zinc-300">
            <span className="h-2 w-2 rounded-full" style={{ background: rateColor(nlr) }} />
            {lr.toFixed(2)} g/s transfer
          </span>
          <span>
            <b className="font-mono text-[13px] normal-case tracking-normal text-zinc-100">{frontPct}%</b> front
          </span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
          <div className="absolute inset-y-0 bg-emerald-600/80" style={{ left: 0, width: `${rearPct}%` }} />
          <div className="absolute inset-y-0 bg-sky-600/80" style={{ right: 0, width: `${frontPct}%` }} />
          <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
        </div>
      </div>
    </div>
  );
}
