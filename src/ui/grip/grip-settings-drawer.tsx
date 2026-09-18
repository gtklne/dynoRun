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
      <h4 className="t-label">Estimated demand</h4>
      <p>Longitudinal demand is (dv/dt)/g plus a generic resistance estimate. The constants are
        air density 1.20 kg/m³, CdA 0.40 m², mass 260 kg and rolling coefficient 0.015.
        These are assumptions, not measurements of your bike. Resistance is zero at standstill.</p>
      <p>Lateral demand is tan(lean). This approximation assumes steady, balanced cornering on level ground
        and representative combined bike/rider lean. Banking, grade, wind and body position are not resolved.
        Demand score is 100 times the combined demand in g. It cannot determine tyre capacity, grip margin,
        or whether a riding input is safe.</p>
      <h4 className="t-label">Observed envelope</h4>
      <p>Each of 72 directions shows the duration-weighted 95th percentile of qualifying demand, with at
        least 0.5 seconds of observations. These are statistical choices, not validated noise filters.
        Unknown directions stay blank. Full-circle RMS and directional scores are unavailable unless
        all their directions have support. The envelope may grow or shrink with additional data.
        Equal lap counts control one sampling difference; they do not establish comparability across bikes,
        sensors or conditions. Colours and the dotted ring use a display scale, not a tyre limit.</p>
      <h4 className="t-label">Demand rate and activity</h4>
      <p>Demand rate is the derivative of the two plotted demand components in g/s. The axes rotate with
        the bike, so this is not inertial jerk or measured suspension load transfer.</p>
      <p className="box plate-sunk t-data px-3 py-2 text-center">activity = 100 × √( demand-g² + (τ × demand-rate)² )</p>
      <p>Activity is a tunable descriptive index, not a physical tyre-force measurement. τ is a weighting
        parameter with units of seconds, not an identified suspension settling time. Set it to zero to
        remove the rate term. Compare activity only with identical settings.</p>
      <h4 className="t-label">Estimated weight split</h4>
      <p>Front fraction = 0.5 - K × kinematic longitudinal g. K approximates centre-of-mass height divided by
        wheelbase, with a 50/50 static split. It omits aerodynamic moments and suspension dynamics.
        At zero or one the model predicts a lift boundary; its two-contact assumptions cease to apply.</p>
      <h4 className="t-label">Corners and data quality</h4>
      <p>Detection uses speed minima and sustained lean. Time windows, lean/speed thresholds and spatial
        clustering are engineering heuristics. Turn identity is approximate, and changing the selected laps
        can change it. Apex demand is the median within ±0.12 seconds; peak is the maximum derived value
        in the detected window. Differences from other laps describe observations, not room to push.</p>
      <p>Filtering uses recorded timestamps and splits at gaps over 1.5 median sample intervals. Missing
        fixes are excluded when the recording preserves that information. Older saved recordings may have
        already lost it. Isolated invalid values are rejected on import. Short transients and sensor bias
        remain possible. Sample-derived lap times are approximate; spatial comparison times use another
        boundary definition and must not be treated as official lap timing.</p>
    </div>
  );
}

/**
 * The marginalia panel: every tunable estimate the analysis rests on, and the
 * notes that say what each reading is worth. Ruled, not floated: it is another
 * sheet slid over this one, so it carries an edge rather than a shadow, and its
 * groups are planes labelled the same way every block on the plate is.
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
        style={{ background: 'var(--color-ink)', opacity: 0.5 }}
      />
      <aside
        aria-label="Grip settings and notes"
        className="fixed inset-y-0 right-0 z-[70] flex w-[460px] max-w-[94vw] flex-col"
        style={{
          background: 'var(--color-sheet)',
          borderLeft: 'var(--rule-strong) solid var(--color-ink)',
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

        <div className="flex-1 overflow-y-auto px-3 py-2.5 sm:px-4">
          {tab === 'settings' ? (
            <>
              <p className="t-body mb-3 text-[0.8125rem] leading-6">
                Every estimate the analysis relies on. Changes apply live. Some re-derive the channels (a beat
                of compute), others just redraw. Defaults are modelling and display choices; they are not calibrated to your bike.
              </p>
              {/* Same convention as every block on the sheet: the group's name
                  lives in a head band inside the plane, not floating above it. */}
              {GRIP_SETTINGS_SCHEMA.map((group) => (
                <section key={group.group} className="plane mb-2" aria-label={group.group}>
                  <div className="block-head">
                    <h3 className="t-label">{group.group}</h3>
                  </div>
                  {group.items.map((item, i) => (
                    <div key={item.key} className={`px-3 py-2.5 ${i > 0 ? 'rule-t' : ''}`}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
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
                          style={{ border: 'var(--rule-hair) solid var(--color-grid-strong)' }}
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
                      <p className="t-annotation mt-1" style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
                        {item.help}
                      </p>
                    </div>
                  ))}
                </section>
              ))}
              <PlateButton className="mt-2" onClick={onReset}>Reset to defaults</PlateButton>
            </>
          ) : (
            <HelpContent />
          )}
        </div>
      </aside>
    </>
  );
}
