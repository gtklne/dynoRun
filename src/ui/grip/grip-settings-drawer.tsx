import { useState } from 'react';
import {
  GRIP_SETTINGS_SCHEMA,
  type GripSettingKey,
  type GripSettings,
} from '@/analysis/grip/settings';

interface GripSettingsDrawerProps {
  open: boolean;
  initialTab: 'settings' | 'help';
  settings: GripSettings;
  onChange: (key: GripSettingKey, value: number) => void;
  onReset: () => void;
  onClose: () => void;
}

function HelpContent() {
  return (
    <div className="space-y-2 text-[12.5px] leading-relaxed text-zinc-300 [&_h4]:mb-1.5 [&_h4]:mt-5 [&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:text-zinc-100 [&_h4:first-child]:mt-0 [&_b]:text-zinc-100">
      <h4>What the numbers are</h4>
      <p>
        Longitudinal g comes from how fast your GPS speed changes; lateral g from lean angle
        (<span className="font-mono">tan θ</span>). Every score is simply <b>measured g demand × 100</b>, so
        100 ≈ pulling 1 g. Scores are absolute: they compare honestly between laps, sessions, bikes and riders —
        a slow, careful day scores lower than a fast one, which is the point. Colours (green→red) are anchored
        to a <b>tyre-class grip level</b> you pick in Settings; changing it recolours, never rescores.
      </p>
      <p>
        Your <b>traction envelope</b> (dashed line on the circle) is the boundary of what you actually did:
        the hardest ~1% in each direction. It comes out asymmetric (more grip cornering than braking, least on
        throttle) because a bike is power/wheelie-limited on exit. The <b>session score</b> in the header is the
        envelope's overall size — 100 would mean working a full 1 g circle in every direction. Watch it across
        sessions to see your riding grow.
      </p>

      <h4>Grip score vs Dynamic load</h4>
      <p>
        <b>Grip score</b> is pure steady-state grip demand. In that mode a straight-line throttle→brake swap
        passes through the centre of the circle as green — it looks harmless.
      </p>
      <p><b>Dynamic load</b> folds the transient in as an orthogonal demand:</p>
      <p className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-center font-mono text-zinc-100">
        dynamic load = √( grip-g² + (τ · transfer-rate)² )
      </p>
      <p>
        so that same swap now reads <b>red</b> even though net g is zero — the tyre and suspension are working
        even when they aren't cornering. <span className="font-mono">τ</span> (Settings) sets how much the
        transient counts; there's no single true value, so it's yours to tune. Smooth, high-grip cornering barely
        moves between the two modes — only violent inputs light up. That makes it a measurable "be smooth" score.
      </p>

      <h4>The traction circle &amp; comet trail</h4>
      <p>
        The circle shows <i>where</i> you are (how much grip). The <b>comet trail</b> and the
        <b> transient timeline</b> show <i>how fast the load is moving</i> — the speed the operating point
        travels around the circle (<span className="font-mono">|dG/dt|</span>, g/s). A hard throttle-to-brake
        swap streaks brightly straight through the middle: the fork is slamming through its stroke even as net g
        passes through zero.
      </p>

      <h4>Weight transfer</h4>
      <p>
        Front/rear distribution uses a simple point-mass model,
        <span className="font-mono"> front ≈ 50% − K·a_long</span>. Set <b>K</b> (Settings) to match your bike —
        higher for a taller or shorter machine that dives and squats more. It's a first-order estimate, not a
        suspension-geometry simulation.
      </p>

      <h4>Corner analysis</h4>
      <p>
        Corners are found from speed minima confirmed by lean, then labelled in order. The big number is the
        <b> apex score</b> (g demand ×100 at the slowest point). Each card also shows your <b>best at that same
        corner across all laps</b> — if this lap sits well below it, the green “spare” flag marks proven,
        repeatable room to push. The <span className="font-mono">◍ g/s</span> badge is how violently you loaded
        the chassis there.
      </p>

      <h4>Honest caveats</h4>
      <p>
        This is a heuristic budget model, not a tyre thermal or carcass simulation. Grip margin at a fast kink
        can be geometry-limited, not courage-limited. Lateral g assumes a balanced bike (steady-state lean), and
        load-transfer is derived from GPS + lean, not a direct fork-travel sensor — though your gyro channels
        back it up.
      </p>
    </div>
  );
}

export function GripSettingsDrawer({ open, initialTab, settings, onChange, onReset, onClose }: GripSettingsDrawerProps) {
  const [tab, setTab] = useState<'settings' | 'help'>(initialTab);
  // follow the opener's intent each time the drawer opens
  const [lastInitial, setLastInitial] = useState(initialTab);
  if (initialTab !== lastInitial) {
    setLastInitial(initialTab);
    setTab(initialTab);
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[70] flex w-[420px] max-w-[92vw] flex-col border-l border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="inline-flex rounded-xl border border-zinc-700 bg-zinc-800 p-1">
            {(['settings', 'help'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold capitalize transition-colors ${
                  tab === t ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'settings' ? (
            <>
              <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                Every estimate the analysis relies on. Changes apply live — some re-derive the channels (a beat
                of compute), others just redraw. Defaults suit a track sportbike.
              </p>
              {GRIP_SETTINGS_SCHEMA.map((group) => (
                <div key={group.group} className="mb-6">
                  <h5 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {group.group}
                  </h5>
                  {group.items.map((item) => (
                    <div key={item.key} className="mb-4">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center text-[13px] text-zinc-200">
                          {item.label}
                          {item.apply === 'recompute' && (
                            <span className="ml-1.5 rounded bg-amber-950 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-400">
                              recompute
                            </span>
                          )}
                        </span>
                        <span className="min-w-[62px] rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-right font-mono text-[13px] text-zinc-100 tabular-nums">
                          {settings[item.key].toFixed(item.dp)}
                          {item.unit && ` ${item.unit}`}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label={item.label}
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        value={settings[item.key]}
                        onChange={(e) => onChange(item.key, +e.target.value)}
                        className="w-full accent-sky-500"
                      />
                      <p className="mt-1 text-[11px] leading-snug text-zinc-600">{item.help}</p>
                    </div>
                  ))}
                </div>
              ))}
              <div className="border-t border-zinc-800 pt-4">
                <button
                  type="button"
                  onClick={onReset}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:text-zinc-100"
                >
                  Reset to defaults
                </button>
              </div>
            </>
          ) : (
            <HelpContent />
          )}
        </div>
      </aside>
    </>
  );
}
