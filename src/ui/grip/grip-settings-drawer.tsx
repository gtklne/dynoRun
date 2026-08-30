import { useState } from 'react';
import {
  GRIP_SETTINGS_SCHEMA,
  type GripSettingKey,
  type GripSettings,
} from '@/analysis/grip/settings';
import { PlateButton, PlateSegmented } from '@/ui/plate';

interface GripSettingsDrawerProps {
  open: boolean;
  initialTab: 'settings' | 'help';
  settings: GripSettings;
  onChange: (key: GripSettingKey, value: number) => void;
  onReset: () => void;
  onClose: () => void;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  );
}

/** The notes that belong on the sheet: what the numbers are, and what they are not. */
function HelpContent() {
  return (
    <div className="t-body text-[0.8125rem] leading-6 [&_b]:font-semibold [&_b]:text-[color:var(--color-ink)] [&_h4]:mb-1.5 [&_h4]:mt-6 [&_h4:first-child]:mt-0 [&_p+p]:mt-2.5">
      <h4 className="t-label">What the numbers are</h4>
      <p>
        Longitudinal g is <b>tire demand</b>, not raw deceleration: the GPS speed derivative corrected for aero
        drag + rolling resistance (fixed generic-race-bike constants: CdA 0.40 m², 260 kg with rider). Holding
        200 km/h therefore reads as ~+0.3 g of drive (the tire really is pushing that hard), and braking reads
        lower than raw GPS decel because the wind slows the bike without loading the tire. Lateral g comes from
        lean angle (<span className="t-data">tan θ</span>). Every score is simply <b>measured g demand × 100</b>, so
        100 ≈ pulling 1 g. Scores are absolute: they compare honestly between laps, sessions, bikes and riders,
        a slow, careful day scores lower than a fast one, which is the point. Colours are anchored to a{' '}
        <b>tyre-class grip level</b> you pick in Settings; changing it recolours, never rescores.
      </p>
      <p>
        Your <b>traction envelope</b> (dashed line on the circle) is the boundary of what you actually did:
        the hardest in each direction, with the top few samples per direction dropped so one bad GPS fix cannot
        define your limit. It comes out asymmetric (more grip cornering than braking, least on throttle) because
        a bike is power/wheelie-limited on exit. The <b>session score</b> in the title block is the envelope&rsquo;s
        overall size, where 100 would mean working a full 1 g circle in every direction.
      </p>
      <p>
        One caveat on that score: the boundary can only grow as you add laps, so a longer session scores higher
        for free, measured at about <b>+8 points from 1 lap to 10</b> of identical riding. That is why the title
        block prints the lap count next to it, and why <b>Compare laps</b> fits every session on the same number
        of laps before putting two scores side by side. Comparing a 4-lap session with a 12-lap one here is not a
        fair fight.
      </p>

      <h4 className="t-label">Grip score vs Dynamic load</h4>
      <p>
        <b>Grip score</b> is pure steady-state grip demand. In that mode a straight-line throttle→brake swap
        passes through the centre of the circle at low demand, so it looks harmless.
      </p>
      <p><b>Dynamic load</b> folds the transient in as an orthogonal demand:</p>
      <p className="box plate-sunk t-data px-3 py-2 text-center">
        dynamic load = √( grip-g² + (τ · transfer-rate)² )
      </p>
      <p>
        so that same swap now reads at the top of the ramp even though net g is zero, because the tyre and
        suspension are working even when they aren&rsquo;t cornering. <span className="t-data">τ</span> (Settings)
        sets how much the transient counts; there&rsquo;s no single true value, so it&rsquo;s yours to tune.
        Smooth, high-grip cornering barely moves between the two modes, so only violent inputs light up. That
        makes it a measurable &ldquo;be smooth&rdquo; score.
      </p>

      <h4 className="t-label">The traction circle and comet trail</h4>
      <p>
        The circle shows <i>where</i> you are (how much grip). The <b>comet trail</b> and the{' '}
        <b>profile view</b> show <i>how fast the load is moving</i>, the speed the operating point travels around
        the circle (<span className="t-data">|dG/dt|</span>, g/s). A hard throttle-to-brake swap streaks straight
        through the middle: the fork is slamming through its stroke even as net g passes through zero.
      </p>

      <h4 className="t-label">Weight transfer</h4>
      <p>
        Front/rear distribution uses a simple point-mass model,{' '}
        <span className="t-data">front ≈ 50% − K·a_long</span>. Set <b>K</b> (Settings) to match your bike,
        higher for a taller or shorter machine that dives and squats more. It&rsquo;s a first-order estimate, not
        a suspension-geometry simulation.
      </p>

      <h4 className="t-label">Corner analysis</h4>
      <p>
        Corners are found from speed minima confirmed by lean. Detection is not stable: the same ten laps of one
        circuit yield anywhere from 6 to 9 detected corners, so a corner is identified by <b>where it is on the
        track</b>, not by the order it was found: every lap&rsquo;s apexes are projected onto your fastest
        lap&rsquo;s line and grouped by position. <b>Turn 4 is the same bend on every lap tab</b>, and the same
        bend the Compare screen calls T4. A detection no other lap agrees with shows as &ldquo;Extra bend&rdquo;
        rather than taking a turn number, and its cross-lap columns read n/a.
      </p>
      <p>
        The headline figure is the <b>apex score</b> (g demand ×100 at the slowest point). Each row also shows
        your <b>best at that same turn across all laps</b>. If this lap sits well below it, the row is flagged as
        spare: proven, repeatable room to push. The transfer column is how violently you loaded the chassis there.
      </p>

      <h4 className="t-label">Honest caveats</h4>
      <p>
        This is a heuristic budget model, not a tyre thermal or carcass simulation. Grip margin at a fast kink
        can be geometry-limited, not courage-limited. The drag correction uses one fixed CdA, so rider tuck vs
        sit-up, wind and track slope are not modelled. Lateral g assumes a balanced bike (steady-state lean), and
        load-transfer is derived from GPS + lean, not a direct fork-travel sensor, though your gyro channels
        back it up.
      </p>
    </div>
  );
}

/**
 * The marginalia panel: every tunable estimate the analysis rests on, and the
 * notes that say what each reading is worth. Ruled, not floated: it is another
 * sheet slid over this one, so it carries a frame rather than a shadow.
 */
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
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default"
        style={{ background: 'var(--color-terrain)', opacity: 0.5 }}
      />
      <aside
        aria-label="Grip settings and notes"
        className="fixed inset-y-0 right-0 z-[70] flex w-[460px] max-w-[94vw] flex-col"
        style={{
          background: 'var(--color-sheet)',
          borderLeft: 'var(--rule-frame) solid var(--color-ink)',
        }}
      >
        <div className="rule-b flex items-center justify-between gap-3 px-3 py-2.5">
          <PlateSegmented
            label="Panel"
            value={tab}
            options={[
              { value: 'settings', label: 'Settings' },
              { value: 'help', label: 'Help' },
            ]}
            onChange={setTab}
          />
          <PlateButton onClick={onClose} aria-label="Close" style={{ padding: '0.5rem' }}>
            <CloseIcon />
          </PlateButton>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {tab === 'settings' ? (
            <>
              <p className="t-body mb-5 text-[0.8125rem] leading-6">
                Every estimate the analysis relies on. Changes apply live. Some re-derive the channels (a beat
                of compute), others just redraw. Defaults suit a track sportbike.
              </p>
              {GRIP_SETTINGS_SCHEMA.map((group) => (
                <section key={group.group} className="mb-7" aria-label={group.group}>
                  <h3 className="t-label rule-b pb-1.5">{group.group}</h3>
                  {group.items.map((item) => (
                    <div key={item.key} className="rule-b py-3">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <span className="t-data flex items-baseline gap-2 text-sm">
                          {item.label}
                          {item.apply === 'recompute' && (
                            <span
                              className="t-annotation px-1 py-px"
                              style={{
                                border: 'var(--rule-hair) solid var(--color-caution)',
                                color: 'var(--color-caution)',
                              }}
                            >
                              recompute
                            </span>
                          )}
                        </span>
                        <span
                          className="t-data shrink-0 px-2 py-0.5 text-sm"
                          style={{ border: 'var(--rule-hair) solid var(--color-rule)' }}
                        >
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
                        className="w-full"
                      />
                      <p className="t-annotation mt-1.5" style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
                        {item.help}
                      </p>
                    </div>
                  ))}
                </section>
              ))}
              <PlateButton onClick={onReset}>Reset to defaults</PlateButton>
            </>
          ) : (
            <HelpContent />
          )}
        </div>
      </aside>
    </>
  );
}
