import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { shareRepository, type PublicShareData } from '@/api/repositories/share-repository';
import { BrandLogo } from '@/ui/components/brand-logo';
import { PowerCurveChart } from '@/ui/components/power-curve-chart';
import { ConditionsChips } from '@/ui/run/conditions-chips';
import { useUnits } from '@/app/units-context';
import { formatPower, type PowerUnit } from '@/shared/format-power';
import { formatShortDateTime } from '@/shared/format-time';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: PublicShareData };

const DEFAULT_TITLE = 'DynoRun';

function setMetaContent(selector: string, content: string): void {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute('content', content);
}

function applyShareMeta(title: string, description: string): void {
  document.title = title;
  setMetaContent('meta[name="description"]', description);
  setMetaContent('meta[property="og:title"]', title);
  setMetaContent('meta[property="og:description"]', description);
  setMetaContent('meta[name="twitter:title"]', title);
  setMetaContent('meta[name="twitter:description"]', description);
}

function buildShareMeta(data: PublicShareData, unit: PowerUnit): { title: string; description: string } {
  const { run, vehicle, curve } = data;
  const peak = curve.points.reduce<{ wheel_power_kw: number; rpm: number } | null>((best, p) => {
    if (best == null || p.wheel_power_kw > best.wheel_power_kw) return p;
    return best;
  }, null);
  const baseTitle = run.title ?? `${vehicle.name} · ${run.gear_label}`;
  const title = peak
    ? `${baseTitle} — ${formatPower(peak.wheel_power_kw, unit)}`
    : baseTitle;
  const description = peak
    ? `Peak ${formatPower(peak.wheel_power_kw, unit)} @ ${peak.rpm.toFixed(0)} RPM · ${vehicle.name} · DynoRun`
    : `${vehicle.name} run · DynoRun`;
  return { title, description };
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="pt-safe bg-zinc-950 border-b border-zinc-800/60 px-4 py-3 flex items-center gap-2">
        <div className="max-w-2xl w-full mx-auto lg:max-w-5xl flex items-center gap-2">
          <a
            href="https://wasgoht.ch"
            className="flex items-center gap-2"
            aria-label="DynoRun home"
          >
            <BrandLogo size={22} />
            <span className="font-bold text-lg tracking-tight">
              <span className="text-amber-400">dyno</span>
              <span className="text-zinc-100">Run</span>
            </span>
          </a>
        </div>
      </header>
      <main className="flex-1 px-4 pt-4 pb-12 max-w-2xl w-full mx-auto lg:max-w-5xl">
        {children}
      </main>
      <footer className="px-4 py-6 border-t border-zinc-800/60 text-center bg-zinc-950">
        <p className="text-zinc-400 text-sm">
          Want your own? Track your car's power at{' '}
          <a
            href="https://wasgoht.ch"
            className="text-amber-400 hover:text-amber-300 font-semibold transition-colors"
          >
            wasgoht.ch
          </a>
        </p>
      </footer>
    </div>
  );
}

export function PublicShareScreen() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const units = useUnits();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await shareRepository.getPublic(token);
        if (cancelled) return;
        if (!data) setState({ kind: 'error' });
        else setState({ kind: 'ready', data });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (state.kind === 'ready') {
      const meta = buildShareMeta(state.data, units.unit);
      applyShareMeta(meta.title, meta.description);
    }
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [state, units.unit]);

  const peak = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const points = state.data.curve.points;
    if (points.length === 0) return null;
    return points.reduce((best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best), points[0]);
  }, [state]);

  const peakTorque = useMemo(() => {
    if (state.kind !== 'ready') return null;
    const points = state.data.curve.points;
    if (points.length === 0) return null;
    return points.reduce((best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best), points[0]);
  }, [state]);

  if (state.kind === 'loading') {
    return (
      <Frame>
        <div className="flex items-center justify-center py-16">
          <p className="text-zinc-500 text-sm">Loading shared run…</p>
        </div>
      </Frame>
    );
  }

  if (state.kind === 'error') {
    return (
      <Frame>
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <h1 className="text-xl font-bold text-zinc-100">Shared run unavailable</h1>
          <p className="text-zinc-500 text-sm max-w-sm">
            This link doesn't exist anymore. The owner may have unshared it, or
            the URL is mistyped.
          </p>
          <a
            href="https://wasgoht.ch"
            className="inline-block bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-zinc-950 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm mt-2"
          >
            Go to DynoRun
          </a>
        </div>
      </Frame>
    );
  }

  const { run, vehicle, curve } = state.data;
  const titleText = run.title ?? `${vehicle.name} · ${run.gear_label}`;
  const opp = units.unit === 'kW' ? 'hp' : 'kW';

  return (
    <Frame>
      <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-8 lg:items-start lg:space-y-0">
        {/* LEFT: header + conditions + peak stats */}
        <div className="space-y-5">
          {/* Header */}
          <div className="space-y-1">
            <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest">Shared run</p>
            <h1 className="text-2xl font-bold text-zinc-100 break-words">{titleText}</h1>
            <p className="text-zinc-500 text-sm">
              {vehicle.name} · {run.gear_label} · {formatShortDateTime(run.started_at)}
            </p>
          </div>

          <ConditionsChips conditions={run.conditions} size="md" />

          {/* Peak stats — 2x2 grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak power</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-amber-400">
                  {peak ? formatPower(peak.wheel_power_kw, units.unit, { unitSuffix: false }) : '—'}
                </span>
                <span className="text-sm text-zinc-400 ml-1">{units.unit}</span>
              </p>
              <p className="text-zinc-600 text-xs mt-1">
                {peak ? formatPower(peak.wheel_power_kw, opp) : '—'}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak torque</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-zinc-100">
                  {peakTorque ? peakTorque.wheel_torque_nm.toFixed(0) : '—'}
                </span>
                <span className="text-sm text-zinc-400 ml-1">Nm</span>
              </p>
              <p className="text-zinc-600 text-xs mt-1">
                {peakTorque ? `@ ${peakTorque.rpm.toFixed(0)} RPM` : '—'}
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 col-span-2">
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Peak power RPM</p>
              <p className="tabular-nums">
                <span className="text-3xl font-bold text-zinc-100">
                  {peak ? peak.rpm.toFixed(0) : '—'}
                </span>
                <span className="text-sm text-zinc-400 ml-1">RPM</span>
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: chart + caption */}
        <div className="space-y-5">
          {/* Chart */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden p-2">
            <PowerCurveChart
              series={[{ label: 'Power', points: curve.points }]}
              mode="power"
              unit={units.unit}
            />
          </div>

          <p className="text-zinc-600 text-xs text-center">
            Wheel power derived from GPS · DynoRun
          </p>
        </div>
      </div>
    </Frame>
  );
}
