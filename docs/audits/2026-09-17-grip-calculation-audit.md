# Grip calculation audit: 17 September 2026

**Verdict: the application cannot currently substantiate measured tyre-grip utilization, available grip, or “proven room to push.”** Some underlying mathematics is correct under restrictive assumptions, and the recorded same-session timing comparisons are good. Several data-validation and numerical defects are reproducible. The dynamic-load score, tyre-class anchors, and most detection thresholds are heuristics without a demonstrated calibration.

This is an audit, not a change to the product. No production data was changed or uploaded, and nothing was deployed.

## Scope and evidence

- Source commit: `638eb4b8345b2012c0d9160c819bc955eaf8232d`.
- Examined all 16 modules in `src/analysis/grip`, the grip UI and its numerical presentation, the API repository, and server ingestion/summary calculations.
- The accompanying [source inventory](grip-source-inventory.json) enumerates **44 files, 2,100 variable/parameter/property declarations, and 1,276 numeric literals**, including visual constants. Each file has a SHA-256 digest; entries have source line numbers. This provides enumeration and traceability, not automatic scientific validation of every identifier.
- Public production bundles for the shared analysis, session screen, comparison screen, and importer match the local production build after replacing content-hashed JavaScript filenames with their unhashed names. See [deployment evidence](grip-deployment-evidence.json). This is evidence about those frontend bundles, not proof of the deployed backend version, database contents, or every runtime configuration.
- Existing relevant tests: **18 files / 157 tests passed**, including the two real CSV fixtures. `npm run build` passed, including TypeScript checking.
- Independent probes: **46 conditions examined: 13 supported, 33 refuted or limited**, grouped below rather than counted as 33 separate bugs. [Script](../../scripts/audit-grip.mjs), [complete results](grip-audit-results.json). Probes distinguish mathematical identities that hold from counterexamples to broad claims or desirable validity conditions. A refuted condition is not necessarily a separate implementation bug: some expose intentional heuristics or misleading names.
- Two local RaceBox recordings were analyzed without uploading them. They establish repeatability and internal consistency, not external tyre-force or friction ground truth.

Reproduce from the repository root:

```sh
node scripts/audit-grip-baseline.mjs
npm test -- tests/analysis/grip tests/ui/grip tests/ui/compare-canvas.test.tsx tests/ui/session-canvas.test.tsx tests/ui/compare-geometry.test.ts
npm run build
```

The audit script deliberately exits **1** when a claim/validity condition is refuted, while still writing its report. It is separate from the ordinary test suite. If the gitignored CSV fixtures are absent, their checks cannot run; the synthetic probes still run. Production-bundle hashes are a separately captured snapshot and are not refreshed by this offline script.

**Meaning of proof here:** algebra can establish an identity under stated assumptions; a counterexample can refute a universal claim. Passing tests on finite datasets cannot prove all inputs correct. Physical thresholds require measured evidence, a specified operating domain, and uncertainty bounds. This report leaves unsupported items unsupported rather than inventing a scientific justification.

## Findings, ordered by consequence

| Priority | Finding | Evidence and location | Required correction |
|---|---|---|---|
| High | Demand is presented as available grip and margin | `corner-cards.tsx:73`, `grip-settings-drawer.tsx:112`, `compare-stats.ts:345`. Higher historical acceleration neither identifies friction capacity nor proves repeatable headroom. | Describe measured/estimated demand and historical differences; remove causal and margin claims until independently validated. |
| High | “Dynamic load” is an invented index displayed on a physical tyre-demand scale | `load.ts:29`, `telemetry-readout.tsx:81`, default mode `grip-session-screen.tsx:99`. At 1 g and 3 g/s, τ=0.3 produces 1.34536, without measuring an additional orthogonal tyre force. | Separate the transient index from physical g, tyre limits, and “spare grip.” |
| High | Invalid numeric input fabricates measurements | `parse-racebox.ts:109`. A missing 30 m/s sample becomes 0 and produces a false **1.41627 g** peak. One missing 45° lean sample produces **0.72654 g** instead of 1 g after smoothing. Infinity and 90° lean are accepted. | Validate every measurement, maintain validity masks, and avoid differentiating across invalid segments. |
| High | Gap handling and sample-rate assumptions distort signals | `channels.ts:48`, `corners.ts:46`, `use-grip-playback.ts:3`. A constant 0.20394 g acceleration with a 5 s gap develops **0.94418 g error**. The same smooth corner is detected at 10 Hz and missed at 25 Hz. | Use timestamp-based processing, explicit gap segmentation, and tested rate support. |
| High | Sparse envelope data fabricates unobserved directions | `envelope.ts:105`. A single 0.8 g observation produces **80 in every directional sector**, with 71/72 bins unobserved. A single 2.25 g observation produces a score of **225**. | Retain missing directions as unknown; require support/coverage before reporting an overall envelope score. |
| High | Envelope quality rejection does not protect other reported metrics | `envelope.ts:78` versus `analyze.ts:20`. Rejected samples remain in colors, corner statistics, weight split and transient calculations. | Propagate quality decisions through all derived outputs, not only the envelope. |
| High | Universal 1.4 g cutoff rejects plausible valid braking | `envelope.ts:41`. A 1.5 g net-deceleration sequence contributes zero samples even with corrected demand below 1.5 g. Manufacturer data documents braking beyond this threshold. | Treat thresholds as quality hypotheses with corroborating evidence, not physical impossibility rules. |
| High | Reference-lap quality diagnostics are fabricated as perfect | `compare.ts:272`. Injecting a **98.706 m** gap returns `maxGapM=0`, `coverage=1`, `verdict='reference'`. The UI warning only sees gaps over 15 m. | Validate the reference independently before using it as the distance axis. |
| Medium | Envelope monotonicity claim is mathematically false | `compare-stats.ts:53`; session and comparison help. Adding one 0.3 g sample changes a synthetic score from **150 to 30**. | Remove “can only grow”; document the actual order statistic and sampling effects. |
| Medium | Weight split omits necessary vehicle/force geometry | `load.ts:44`, `telemetry-readout.tsx:38`. Static split is always 50/50; aerodynamic moments are omitted; 2-98% clamp hides wheel lift. | Identify the estimate as conditional; require geometry and force application assumptions for physical load claims. |
| Medium | Session map length uses inaccurate conversion constants | `project.ts:15`, `grip-session-screen.tsx:186`. Displayed lengths are **8.37-10.20 m shorter** than comparison lengths in the real recordings. | Use the same WGS84 geometry for both. |
| Medium | Interpolation disagrees on repeated projected positions | `align.ts:417` and `align.ts:443`. For u=[0,1,1,2], values=[0,1,2,3], at u=1 exact lookup returns 2 and grid resampling returns 1. | Adopt one explicit plateau policy and mark ambiguous/stationary timing. |
| Medium | Different-layout pace uses the wrong duration | `compare-stats.ts:380`. It divides the subject's own length by the time projected onto the reference axis. Synthetic counterexample: **100 m/s instead of 20 m/s**. A real fixture changes by about **0.40 km/h** when changing the reference. | Divide by the subject's own well-defined duration; label different-layout pace as descriptive, not comparable performance. |
| Medium | Corner/turn identity is heuristic, not guaranteed | `corners.ts:30`, `turn-cluster.ts:35`, `turns.ts:24`. Constant-speed bends are missed; opposite-direction apexes 30 m apart merge; comparison selection changes support/reference geometry. | Validate against annotated turns; preserve direction/layout identity and express uncertainty. |
| Medium | Stored data is incompletely validated and loses quality provenance | `storage.ts:39,52`. A null at index 1 in a 1,000-sample column passes; empty metadata passes then crashes analysis; missing-fix count disappears on save. | Exhaustive validation and persisted provenance/masks, including metadata and monotonic time. |
| Low/Medium | Smaller numeric and presentation defects | Missing timestamp drops are not counted; valid zero longitude is rejected; geographic bounds are unchecked; fallback lap duration loses an interval; duplicate lap identities are accepted; partial duty intervals are discarded; displayed “Peak” is a robust statistic; 119.999 s prints `1:60.00`. | Correct the contracts and add targeted regression coverage. |

## Mathematical audit

### 1. Inputs and units

`types.ts:9`, `parse-racebox.ts`, `storage.ts`, server `grip-sessions.ts`.

| Variable(s) | Intended meaning / unit | Assessment |
|---|---|---|
| `t`, `ms`, `t0`, `te`, `dt` | Seconds since first sample, from timestamp differences divided by 1,000 | Correct conversion. Parser enforces strictly increasing retained timestamps, but does not split long gaps. Stored data can bypass that invariant. |
| `lat`, `lon`, `lastLat`, `lastLon`, `firstFix` | Degrees, with missing positions held/backfilled | Holding preserves array length, but is not a real position measurement. It creates zero-distance plateaus and a jump on reacquisition. Validity is not retained per sample. |
| `spd`, `spdS` | m/s, raw and smoothed speed | Header identifies m/s; multiplying by 3.6 correctly gives km/h. Raw missing values become 0, nonfinite values can survive. Negative speed is not rejected. |
| `lean`, `leanS` | Signed degrees, assumed left negative / right positive | Conversion to radians is correct. Range, uncertainty, mounting, sign provenance and logger algorithm are not validated. |
| `lap`, `num` | Positive integers for timed laps; 0 for untimed | Neither parser nor server validates integer/nonnegative values or continuity/uniqueness. |
| `head` | Heading in degrees | Imported but unused in the grip derivation. No independent lateral-acceleration consistency check uses it. |
| `meta.best`, `meta.laps[].time` | Lap times in seconds | Trusted if `parseFloat` yields a finite number; positivity is not enforced. `parseFloat('1:23.4')=1`, so formatted durations are not supported. Supplied fixtures use the supported numeric representation. |
| `noFix`, `dropped` | Import quality counters | `noFix` counts held positions. Invalid timestamps are skipped without incrementing `dropped`. Both counters are lost by pack/unpack. |
| `n` | Retained samples | Derived from time length. Minimum 25 samples is not a duration check. |

The real CSV headers also contain altitude, GForceX/GForceZ and GyroX/Y/Z. The parser discards them. The help text's statement that gyro channels “back it up” does not describe an implemented validation step.

Simple comma splitting is not a complete CSV parser: quoted commas in metadata, quoting of numeric cells, and alternate column conventions are not robustly supported. This is a format limitation, not evidence the supplied files are parsed incorrectly.

Packing rounds time to 0.001 s, position to 10⁻⁷ degrees, speed to 0.001 m/s, lean to 0.01°, heading to 0.1°. Corresponding half-step errors are 0.0005 s, about 5.6 mm in latitude, 0.0005 m/s, 0.005°, and 0.05°. At 60° lean, 0.005° alone corresponds to about 0.00035 lateral g. These are quantization limits, not overall sensor accuracy. CSV timestamps have already been quantized by `Date.parse`; repeated/sub-millisecond times can collapse and be dropped.

Server structural validation checks every numeric element for finiteness and caps sample count, which is stronger than the client's sampled element check. It still does not validate physical ranges, time monotonicity, or the nested lap metadata needed by analysis. Server `lap_count` counts metadata rows; client laps come from sample labels, so the library and analysis can disagree. Server `duration_s=t[last]` presumes rebasing to zero, which its input guard does not enforce. None of these backend observations establishes that corrupt data currently exists in production.

### 2. Smoothing and longitudinal acceleration

`channels.ts:20,47`, `load.ts:11`.

For an odd window w=2h+1, the interior moving average is

\[
\bar v_i=\frac{1}{w}\sum_{k=-h}^{h}v_{i+k}.
\]

At edges, the implementation divides by the number of available samples. This is mathematically correct as a sample average. It is not a time-weighted average on an irregular clock. `w >> 1` means an even or fractional requested window is silently mapped to a different odd integer window.

The derivative implemented is

\[
G_{x,raw,i}=\operatorname{MA}_5\left[
\frac{\bar v_{i+3}-\bar v_{i-3}}
{g_0(t_{i+3}-t_{i-3})}\right],\quad g_0=9.80665\ \mathrm{m/s^2}.
\]

Standard gravity is the correct conventional conversion for reporting g; it is not an assertion that local gravity has exactly this value. [NIST SI conversion factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9).

**Proof in the valid simple case:** for uniform sampling and v(t)=v₀+at, a centered average preserves the linear function. The central difference returns a, and averaging that constant preserves it. The independent probe's interior error was less than 7.7×10⁻⁷ g. Near endpoints the shrunk windows no longer preserve the sample's original time center, so acceleration is biased.

**Counterexample on a valid nonuniform clock:** add a 5 s gap to otherwise 25 Hz data while retaining v(t)=10+2t. The true acceleration is constantly 2/9.80665=0.203943 g. Sample averaging across the gap produces up to 0.944182 g error. Dividing by the true timestamp interval alone does not fix the surrounding sample-based smoothing.

**Frequency response:** for uniform 25 Hz sampling, a centered w-point average has response

\[
H_w(f)=\frac{\sin(w\pi f/25)}{w\sin(\pi f/25)}.
\]

Relative to an ideal derivative, the ±3-sample difference contributes sinc(6πf/25). At default w=9 the acceleration response magnitude is therefore |H₉ H₅ sinc(6πf/25)|:

| Frequency | Retained acceleration amplitude |
|---|---:|
| 0.5 Hz | 91.13% |
| 1 Hz | 68.31% |
| 2 Hz | 17.43% |
| 3 Hz | 1.32% |

This attenuation is large for fast rider inputs. The linear interior speed-to-acceleration filter reaches ±9 samples (±0.36 s) around the reported instant; subsequent jerk processing reaches ±14 (±0.56 s). Lean is initially smoothed over only ±2 samples. Combining components therefore combines differently filtered signals.

The symmetric offline filter has zero phase in its passband, not the causal delay implied by “slightly laggy.” It smears events before and after their occurrence. Negative high-frequency response and edge effects also preclude a universal “lag” description.

RaceBox's own protocol supports 25, 10, 5 and 1 Hz recordings, plus 20 Hz on firmware 3.3+, and documents possible recording gaps. A universal 25 Hz assumption is not justified by the product family. [RaceBox protocol, revision 9, pp. 12-14](https://www.racebox.pro/products/mini-micro-protocol-documentation?k=67c166d0bda80de96505efba).

### 3. Resistance correction

`channels.ts:3-16,62`.

Implemented:

\[
G_R(v)=\frac{\rho C_DA}{2mg_0}v^2+C_{rr},\qquad
G_x=G_{x,raw}+G_R(v),
\]

with ρ=1.20 kg/m³, CdA=0.40 m², m=260 kg, Crr=0.015. Thus Kdrag=0.24/(260·9.80665), in units s²/m². These units correctly turn v² into a dimensionless acceleration in g. The underlying drag equation is established; the constants require vehicle and environmental measurement. [NASA drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/).

**Conditional force balance:** on level ground, in still air, with the assumed equivalent rolling resistance, `m·dv/dt = Fpropulsive − D − R`, so `Fpropulsive/(mg)=dv/dt/g+D/(mg)+R/(mg)`. The positive sign of the correction is right for this model, including braking. Its interpretation as total tyre-force utilization requires more care about contact forces, rolling-loss moments and axle distribution.

| Test case | Model result / missing term |
|---|---:|
| Hold 100 km/h | +0.087629 g |
| Hold 200 km/h | +0.305517 g |
| Same 200 km/h, actual mass 200 kg instead of 260 kg | Model underestimates by 0.087155 g |
| Same 200 km/h, 10 m/s headwind | Model underestimates by 0.113999 g |
| Constant-speed uphill at 5% grade | Omitted gravitational term ≈0.049938 g |
| Stationary upright | Reports 0.015 g although this steady rolling model does not apply at rest |

The mass/wind examples are sensitivity calculations, not claims about the user's motorcycle. Rider posture changes CdA; the correct drag input is relative air velocity. Uphill/downhill, banking, aerodynamic lift/downforce, wheel rotational inertia and tyre losses are not resolved. Merely linking a vehicle in the UI does not change these fixed coefficients.

**Status:** algebra supported under assumptions; constants and cross-bike accuracy unvalidated. No basis was found for claiming one set is a calibrated generic race-bike truth.

### 4. Lateral acceleration and combined demand

`channels.ts:65-76`.

Implemented: `alat = tan(leanS·π/180)`, `comb = hypot(along, alat)`, `theta = atan2(along, alat)`.

For a balanced point-mass bike+rider in a steady flat turn, the resultant contact force points along the contact-to-system-CoM line. Force/moment equilibrium gives `tan φ = ay/g`. That is the correct derivation for **system equilibrium lean**, with no roll acceleration and appropriate gravity/normal-load assumptions.

It is not automatically true for a sensor's chassis roll angle. Rider displacement and tyre width can separate chassis lean from the combined system's equilibrium angle; modern estimation research explicitly distinguishes those quantities. [Mimmo & Zanzi, equations 11-14 and Remark 4](https://arxiv.org/html/2302.06265v1).

Examples and sensitivity:

- 30° → 0.57735 g; 45° → 1 g; 60° → 1.73205 g.
- A 45° versus 50° input changes the result by **0.19175 g / 19.18 points**.
- d(tan φ)/dφ = sec²φ. At 60°, 1° corresponds locally to **0.06981 g**, already larger than the 3-point comparison deadband.
- At a 30° frictionless banked turn with the matching speed/radius, horizontal acceleration is g·tan30° but required lateral friction is zero. Horizontal acceleration is not universally friction demand relative to the road.
- Accepted 90° input produces approximately **1.63×10¹⁶ g** in the actual Float32 output. Filtering only the envelope cannot make the other displays valid.

RaceBox advertises lean analysis, but the inspected public materials do not establish the exact `LeanAngle (deg)` export algorithm, reference frame, error bounds, or independence from GNSS-derived turn acceleration. Treat it as an input of unresolved provenance. [RaceBox app description](https://www.racebox.pro/products/mobile-app).

The norm `sqrt(Gx²+Gy²)` is correct for orthogonal, compatible components. `atan2(Gx,Gy)` is internally consistent with x=lateral, y=longitudinal: right=0, drive=π/2, brake=−π/2, left=±π. That validates coordinate arithmetic, not the force estimates entering it.

Even exact acceleration does not identify friction capacity. On flat ground a simple aggregate utilization would involve

\[
U=\frac{\sqrt{F_x^2+F_y^2}}{\mu F_z}.
\]

The app does not measure μ or axle-specific Fz/forces. The same observed demand of 0.6mg is compatible with μ=0.65 and μ=1.2, with very different margins. Both situations can generate the same inputs. Therefore available grip is **not identifiable from these inputs**. Real tyre combined-slip behavior also depends on load, camber and slip; a circle is a simplification. [Experimental motorcycle tyre model](https://www.research.unipd.it/handle/11577/143336), [friction-estimation research discussing excitation limits](https://arxiv.org/abs/2407.11805).

### 5. Transients, “dynamic load,” and weight transfer

`load.ts`, `types.ts:77`, `telemetry-readout.tsx`.

The code differentiates the body/path-aligned demand components and computes `loadRate=hypot(jLong,jLat)`, in g/s. This is a well-defined **rate of change of the plotted operating point**. It is not a directly measured load transfer, fork velocity, or tyre force.

For a time-dependent rotation R, inertial differentiation obeys

\[
\frac{d(Ra_b)}{dt}=R\left(\dot a_b+\omega\times a_b\right).
\]

The implementation omits the rotating-frame term. At constant speed 20 m/s around a 50 m radius circle, its component rate is zero while inertial jerk is v³/(R²g)=**0.326309 g/s**. Its norm is invariant under a *constant* rotation of the component axes, not under arbitrary rotating frames. The source comment's blanket frame-independence statement is too broad. The component-rate interpretation can still be useful.

`dynamic = sqrt(comb²+(τ·loadRate)²)` is dimensionally consistent because τ has seconds. Dimensional consistency alone does not establish an orthogonal force or a suspension settling model. A physical response model would need dynamics, initial conditions, stiffness/damping/inertia, tyre response and validation. For comb=1 and loadRate=3, τ=.3 yields 1.345362; for comb=0 it yields .9 despite zero instantaneous steady demand. Both results follow the chosen index definition, not a force-balance proof. The help partly acknowledges τ is tunable, but then displays the index against tyre g anchors and uses it for “spare” advice by default.

The ideal level-road, zero-aero-moment front-load equation is

\[
\frac{N_f}{mg}=f_0-\frac{h}{L}\frac{a_x}{g}.
\]

The implementation fixes f₀=.5 and sets h/L=K. Its acceleration sign is correct: at ±.5 g and K=.45 it reports 27.5% / 72.5% front. Static distribution and K cannot be inferred from the CSV.

With drag D applied at height hD above the ground, a simple quasistatic moment balance instead gives

\[
N_f L=mg b-ma_x h-Dh_D,
\]

before additional aero/pitch/slope terms; b is CoM distance from the rear contact. Pure aero deceleration applied at CoM height produces no transfer in this simple model because the two dynamic terms cancel. The app's `alongRaw` alone predicts forward transfer. Conversely, steady-speed propulsion against drag can change axle loading even though raw acceleration is zero. “Total deceleration, drag included” is not enough to choose a universally correct input without force geometry.

The 2-98% clamp is a display saturation. With K=.45, the ideal front reaches zero at .5/.45=1.1111 g, but the display never goes below 2%. It conceals departure from the model's two-contact regime. No front/rear suspension motion can be deduced from this fraction alone. A single-track motorcycle also does not have the automobile-style left/right pair of axle contact loads implied by “side-to-side load transfer.”

### 6. Envelope and session score

`envelope.ts`, `compare-stats.ts:53-137`.

Actual algorithm:

1. If **any** `lap>0` exists, exclude all samples with `lap<=0`; otherwise allow the whole recording.
2. Require speed **strictly greater** than envMinSpeed/3.6, combined demand ≤2.5 g, and |raw longitudinal g|≤1.4.
3. Partition θ into 72 equal 5° bins.
4. Sort each bin. For n values, discard `d=min(max(12,ceil(.01n)),floor(.25n))` high values and retain index `n−1−d` (with floating arithmetic determining `ceil`).
5. Fill empty bins from the nearest originally populated bin; ties use the smaller radius.
6. Set each radius to `max(raw[b], mean(raw[b−2..b+2]))` circularly.
7. `gref=max(radius)`, `sessionScore=100·sqrt(mean(radius²))`.

The RMS calculation is correct for the constructed radius vector. For a piecewise-constant polar boundary, area A=(1/2)∫r²dθ≈π·mean(r²), so RMS radius is a useful area-equivalent radius. That does not make filled directions observations or the contour a measured traction limit. The plotted straight-sided polygon is not exactly this integral.

**Refutations:**

- At n=1..3, floor(.25n)=0: **nothing is discarded**. The claim that a bad fix cannot define the boundary is false. At n=4, only one value is dropped, not twelve.
- Counts across different laps need not be contiguous in time. Twelve samples do not establish a sustained 0.48 s event. At another recording rate they do not even represent 0.48 s of aggregate sample time.
- For n=47 with 35 values .3 and 12 values 1.5, d=11 and radius=1.5. Add one low .3 value: n=48,d=12,radius=.3. All-filled-circle score falls **150→30**. Max-preserving spatial smoothing does not make a changing percentile/order statistic monotone in sample count.
- One .8 g right-turn observation fills the entire ring at .8: braking, drive and left-turn scores also read 80. Coverage warning information exists, but it does not stop these directional figures being manufactured.
- The 1.4 g raw-longitudinal cap is not a universal wheelie/stoppie bound. Those limits depend on CoM position/height, aero and slope. Brembo documents MotoGP braking at 1.5 g, and characterizes hard zones with deceleration at least 1.4 g. This refutes the universal impossibility argument; it does not establish the correct cutoff for an ordinary sportbike. [Brembo 2026 Austin data](https://www.brembo.com/en/motorsport/motogp/2026/facts-austin-2026), [Brembo circuit analysis](https://www.brembo.com/en/motorsport/motogp/demanding-circuit).
- Five-bin max/mean smoothing can increase an adjacent radius without any supporting data in that direction. It preserves the retained statistic, not all observed extremes already discarded.

Equal-budget fitting computes every consecutive k-lap window, sorts whole-window scores and picks the middle window (upper middle for even counts). Keeping one actual fitted window is a coherent selection rule. Equal lap count does **not** guarantee equal samples, lap duration, excitation, angular coverage, speed, road conditions, layout or sensor quality. In particular, the fixture pair runs different layouts, so forcing the same lap count cannot make the two envelope scores equivalent physical performance measures.

The nonempty fit boolean only requires one sample. There is no calibrated minimum independent sample count, angular coverage or confidence interval. The “99th percentile” wording is inaccurate for the sparse regime where the rule can trim up to 25%, and the hard-coded 12-sample minimum dominates many bins.

### 7. Laps, corners, turn IDs and advice

`laps.ts`, `corners.ts`, `turns.ts`, `turn-cluster.ts`, `corner-cards.tsx`, `compare-turn-table.tsx`.

Lap segmentation correctly collects contiguous equal positive labels, inclusive `[start,end]`. Metadata time wins over sample duration. The fallback subtracts last-minus-first, which is the sampled span, not generally the full timing-line interval: a 50-sample segment at 25 Hz spanning a full 2 s between label boundaries reports 1.96 s. Boundary phase adds further uncertainty. Out/in/pit labels may split a lap into duplicate numbers; consumers assume `${sessionId}:${lap.num}` is unique. Zero or negative metadata times can influence fastest-lap selection.

Corner detection defines a corner as a local speed minimum, merged with nearby minima, satisfying bilateral speed prominence and lean **at the minimum**. This is a definition of a detected slowdown event. It cannot cover every geometric bend: a 10 s constant-speed 30° turn returns none. Lean maximum, geometric apex, minimum speed and maximum acceleration need not coincide. Strict `>` tests mean a value exactly at either advertised minimum is rejected. Merging occurs before lean/prominence validation, so a deeper nearby noncorner dip can suppress a valid candidate.

The window-expansion tolerance .05 m/s is applied per sample, and the check can step one sample beyond the nominal 4 s cap. Midpoint clipping makes adjacent sample windows disjoint but does not prove they follow physical corner boundaries.

`apexG` is the upper median of up to seven samples around minimum speed; `peakG` is `max(apex, lower-order p90)` over the window. This is robust by definition, not a measured maximum: 99 samples of .5 g and one of 2 g yield displayed peak .5 g when the apex is elsewhere. `peakLoad`, `maxLean` and `minSpeed` use extrema, a different noise policy. Use an explicit label such as “p90 / apex maximum” if retaining this statistic.

Turn matching projects apexes onto a reference lap, clusters neighbors within 40 m, splits chains wider than 80 m, and requires ceil(.4·lapCount) supporting laps (at least one). These are uncalibrated association thresholds. Left/right is not a condition of clustering: L at 100 m and R at 130 m merge. Wraparound at the start/finish is not clustered cyclically. Single-session matching uses all laps and its fastest reference; comparison uses selected compatible laps and the chosen reference. These different inputs and deduplication rules do not prove the help's promise that the same T4 always denotes the same bend on both screens.

`bestApexPerTurn` includes the current lap and any same-lap duplicate assigned to that turn. Consequently “your best on other laps” is not guaranteed. Rounded-score comparison can call a 9.02-point difference “10 spare” when separate values straddle rounding boundaries. The 10-point default is a UI deadband, not a statistically derived margin. “Matched” also includes below-best values inside the deadband.

`turnPayoff` classifies two scalar differences using ±.05 s and ±3 points. Its arithmetic branches are clear, but their causal labels are unproved. Identical apex g and different corner time can arise from braking phase, line, traffic, grip conditions, engine output, measurement error or window placement. The two values cannot distinguish those causes. A faster lap with substantially *less* demand also enters `faster-other`, whose hint says “same demand.” Calling a slower lap “grip was there” or a historical difference “proven, repeatable room to push” exceeds the information supplied.

### 8. Projection, alignment, elapsed time and comparison statistics

`project.ts`, `align.ts`, `compare.ts`, `compare-stats.ts`.

The comparison uses correct WGS84 ellipsoid constants a=6,378,137 m and f=1/298.257223563. For latitude φ, e²=f(2−f), N=a/√(1−e²sin²φ), M=a(1−e²)/(1−e²sin²φ)^(3/2). Local degree scales are kx=N cosφ·π/180, ky=M·π/180. These follow the local ellipsoid geometry; applying one frame over a circuit is still a local approximation. [NGA WGS84 defining parameters](https://earth-info.nga.mil/?action=wgs84&dir=wgs84).

Single-session projection instead uses `111320·cosφ` and `110540`. At 47° the correct meridian factor is 111170.8415 m/degree; 110540 is approximately **0.568% low** for a north-south displacement. The source's claim of sub-metre accuracy across a racetrack is false. Although auto-fitting a map hides scale errors visually, the UI prints lap metres from these coordinates.

`lapPath` projects x/y, accumulates successive chord lengths using double precision, and stores arrays as Float32. This is sensible for local circuits; it is a planar sampled path length, not exact continuous 3D travel. Noise adds path length, chord approximation loses curvature length, and altitude is ignored. The odometer diagnostic uses right-endpoint `speed[i]·dt`, not trapezoidal integration. `odoRatio≈1` can detect some problems but is not independent ground truth, especially when both speed and position originate from one GNSS solution.

Nearest-segment projection uses the standard dot-product fraction `f=((p−a)·(b−a))/|b−a|²`, clamped on ordinary segments, with limited extrapolation at terminal segments. Distance u is interpolated along the reference chord. Local search and a monotonic clamp reduce obvious hairpin/backtracking matches, but do not prove correspondence. After a clamp, u can refer to a different position than the previously computed nearest point and offset. This can overstate positional confidence.

`selfClearance` measures sampled point-to-point separation, not exact segment-to-segment distance. Skipped intermediate points can miss a crossing; the 60 m along-track exclusion can hide nearby legs of a short hairpin. Its tolerance floor of 2 m also contradicts a guarantee to always stay inside half the clearance if the clearance is under 4 m. Overpasses/crossings are not distinguished by altitude or track identity.

Cross-session translation fitting iterates nearest matches three times, averaging residuals within 8 m and accepting shifts ≤5 m. That is an ICP-like fitting heuristic, not an identifiable GNSS bias measurement: true line differences can have the same residual. Within-session GNSS drift can also change, so “identical datum by construction” is an assumption. The search starts near the reference start; sessions with different start lines can fail despite sharing a circuit.

Elapsed time at a spatial station is interpolated from `(u,te)`; subtracting each lap's time at the shared zero removes start-sample phase bias. For well-matched monotone paths this is a sound approach, and the real fixture timing errors are small. The finish station is the reference lap's last sampled position, not independently the timing line. Metadata timing and spatial timing are distinct clocks.

`valueAtU` uses the last value on a repeated-position plateau; `resampleByDistance` can use the first. Both require an explicit shared policy. Holding endpoint values outside the sampled extent also needs a quality flag rather than being treated as a measurement.

Verdict uses only longest contiguous section fraction and, for full alignment, length ratio. It does not reject on `odoRatio`, clamp count, or uncertain time. With a ≥98% common section, “aligned” can still permit a finish outside that section; `finishDelta` then samples a held/projected end value. Corner `measured` checks containment but not a minimum sample count or positional confidence. Entry/exit speeds select the first/last sample inside the window rather than interpolating at the exact boundaries.

The reference bypasses the ordinary projection-quality computation and reports zero gaps/clamps and full coverage. This is not just theoretical: an injected 98.706 m reference gap remains “perfect.” A quality check must exist independently of whether a lap is selected as reference.

Segment duration `t(sEnd)−t(sStart)` is correct. Adjacent segments telescope: Σ(tᵢ₊₁−tᵢ)=tLast−tFirst. The real recordings satisfy this to below 10⁻⁹ s in the computed representation. Summing segment minima gives a descriptive “best pieces” statistic. It does not prove that a physically continuous lap can join those pieces at their different boundary speeds/states.

Duty metres sums widths of **reference-axis** cells, classified by midpoint component values. Brake/coast/drive partition accepted cells, but they do not measure actual individual path lengths, despite UI wording implying otherwise. Section-edge cells are discarded rather than clipped: [1,5] on stations [0,2,4,6] yields only 2 m, not 4 m. An ordinary partial interval can lose almost two grid steps. Threshold crossings inside cells are approximated by a whole-cell midpoint decision.

`lapPace` incorrectly mixes subject path length and projected-axis elapsed time. Use subject path length and its own duration under one stated boundary convention. Even with that fix, a different-layout mean speed cannot rank rider performance fairly.

## Settings and threshold ledger

Status: **identity** = mathematical/unit definition; **conditional** = defensible model under explicit assumptions; **heuristic** = engineering/display choice with no demonstrated calibration; **defect** = contract or numerical failure shown here. A documented default is not validation.

### User-adjustable settings : every schema field

| Field | Default; accepted bounds; UI step | Unit / purpose | Assessment |
|---|---|---|---|
| `K` | .45; .30-.60; .01 | h/L, front-weight estimate | Conditional geometry; range is an unvalidated product choice. Also requires actual static weight split and aero moments. |
| `tau` | .30; .05-.60; .01 | s, transient index weighting | Heuristic. Help describes 0 as meaningful, but sanitizer/UI disallow 0. No measured settling-time fit. |
| `anchorG` | 1.10; .70-1.50; .05 | g, color full-scale | Heuristic. Rain .80, sport road 1.00, race road 1.10, slick 1.30 examples have no demonstrated tyre/road/temperature calibration. Not a friction limit. |
| `envMinSpeed` | 18; 5-60; 1 | km/h, fit filter | Heuristic. Actual comparison is strict `>` after /3.6. Speed alone cannot identify pit or poor-quality data. |
| `cornerLean` | 8; 4-25; 1 | degrees, apex filter | Heuristic. Strict `>` differs from “at least.” Sensitive to lean provenance and rider geometry. |
| `cornerDrop` | 7; 3-20; 1 | km/h, bilateral speed prominence | Heuristic. Strict `>`, fixed sample horizon, requires speed minima. |
| `mergeGap` | 1.2; .4-2.5; .1 | s, merge nearby minima | Heuristic; timestamp-based part is sound but does not identify a physical corner. `<` means exact equality is not merged. |
| `spareScore` | 10; 3-30; 1 | rounded points below best | Heuristic difference flag, not grip reserve. Independently rounded inputs affect the threshold. |
| `rateFS` | 3.0; 1.0-3.5; .1 | g/s, transient display saturation | Heuristic; changes sharply with smoothing/logger rate. Claim that hard inputs top out near 3 is not a general bound. |
| `speedSmooth` | 9; 3-19; 2 | samples, speed averaging | Heuristic filter; must be tied to rate/bandwidth. Sanitizer accepts fractional/even values, unlike UI steps. |

The sanitizer correctly discards unknown keys, supplies defaults for missing/nonfinite values, and clamps numeric bounds. It does **not** snap to UI steps or enforce odd integer smoothing. Comparison resolution keeps values all sessions share and otherwise resets to defaults, which is a coherent consistency policy; it does not make those defaults physically correct. Recompute keys correctly include speed smoothing, envelope minimum speed and the three corner-detection controls; τ only remixes the index, other settings affect presentation.

### Hidden physical, signal and statistical constants

| Location / constant | Value | Effect / audit status |
|---|---:|---|
| `channels.GRAVITY` | 9.80665 | Identity: standard g conversion. |
| `K_DRAG` inputs | .5, 1.2, .4, 260 | .5 is drag-equation factor; remaining values are assumed density, CdA, mass. Conditional, uncalibrated here. |
| `CRR` | .015 | Assumed effective rolling resistance; no standstill/reverse/load correction. |
| Lean conversion | π/180 | Identity: degrees to radians. |
| Speed conversion | 3.6 | Identity: (1,000/3,600)⁻¹. |
| `movAvg` half-width | `w >> 1` | Makes actual width 2·floor(w/2)+1 for the positive accepted range; sanitizer mismatch. |
| Lean smoother | 5 samples | Heuristic, nominal 0.20 s sample-count window at 25 Hz; first-to-last span 0.16 s. |
| Speed derivative half-width | 3 samples | Central difference over nominal .24 s; edge/irregular-clock limitations. |
| Longitudinal post-smoother | 5 samples | Additional attenuation; not independent evidence of accuracy. |
| Jerk derivative/post-smoother | ±3, 5 samples | Same sampling assumptions; magnifies model/noise sensitivity. |
| Derivative guard | dt>0, else 0 | Avoids division by zero but can fabricate zero derivatives for invalid stored clocks. |
| Front static fraction | .5 | Unmeasured fixed assumption. |
| Front clamp | .02-.98 | Display saturation; hides contact loss/model invalidity. |
| Score multiplier | 100 | Defined point scale; correct for a g estimate, not percent utilization. |
| `ENVELOPE_BINS` | 72 | 5° resolution, heuristic. No angular uncertainty criterion. |
| `ENVELOPE_PCT` | 99 | Not pure p99 because other trim rules dominate. |
| `DROP_MIN` | 12 | Count, not persistence; overridden by sparse-bin cap. |
| `DROP_MAX_FRACTION` | .25 | Caps trimming; 1-3 samples have no rejection. |
| `FIT_MAX_G` | 2.5 | Heuristic fit-only cutoff; no proof all larger values are artifacts. |
| `FIT_MAX_LONG_G` | 1.4 | Refuted as universal impossibility boundary. Uses raw acceleration, not corrected demand. |
| Empty-bin search | 1..36 bins | Circular nearest fill; manufactures unknown directions. |
| Envelope smoother H | 2 | Five bins / 25° bin coverage; upward-only alteration. |
| Sector boundaries | ±π/4, ±3π/4 | Defined four-quadrant partition; 18 bin centers each. Correct coordinate convention. |
| Equal-budget median | `length >> 1` | Upper middle window when even; heuristic representative selection. |
| Corner prominence horizon | ±75 samples | 3 s only at 25 Hz; 7.5 s at 10 Hz. |
| Window monotonic tolerance | .05 m/s per sample | ≈1.25 m/s² at 25 Hz, .50 at 10 Hz; rate-dependent. |
| Window temporal cap | 4 s each side | Heuristic; can overshoot by one sample. |
| Adjacent-corner split | midpoint, floor, +1 | Disjoint index windows; physical boundaries unproven. |
| Apex statistic | ±3 samples, upper median | Up to 7 samples (.24 s endpoint span at 25 Hz); robust summary, not exact apex force. |
| Corner “peak” | lower p90, floored index | Deliberately not maximum; label misleading. |
| Turn linkage distance | 40 m | Heuristic; no direction requirement. |
| Maximum cluster extent | 80 m | Recursive largest-gap split; no evidence universally fits corner geometry. |
| Turn support | max(1,ceil(.4·laps)) | Heuristic; two laps need only one supporting lap. Numbering depends on selection. |
| Parser minimum | 25 samples | Not one-second validation. |
| Position validity | finite and each coordinate !=0 | Rejects valid equator/meridian positions; accepts out-of-range finite coordinates. |
| Storage version | 1 | Format compatibility marker, not calculation version/calibration provenance. |
| Storage rounding | 3/7/7/3/2/1 decimals | Quantization described above; lap labels unchanged. |
| Client validation stride | max(1,floor(n/200)) | Samples about 200 entries plus last; misses isolated corruption. |
| Server sample cap | 500,000 | Resource limit: about 5.56 hours at 25 Hz; not a physical data-quality threshold. |

### Alignment and result-affecting display constants

| Location / constant | Value | Effect / audit status |
|---|---:|---|
| Session projection degree scales | 111320, 110540 | Approximation; printed length error demonstrated. |
| WGS84 a, inverse f | 6378137, 298.257223563 | Verified definitions; derived local projection conditional on small area. |
| `DIST_STEP_M` | 2 m | Approximate step: `round(length/2)` intervals, endpoints preserved to Float32 precision. |
| `LAP_PAD_SAMPLES` | 6 | .24 s at 25 Hz, .6 at 10 Hz; heuristic boundary bracketing. |
| Projection tolerance cap/floor | 12 m / 2 m | Heuristic; floor can exceed half-clearance. |
| Clearance fraction | 1/2 | Geometric intuition, not guaranteed with sampled point distances/crossings. |
| Clearance along-axis exclusion | 60 m | May hide short-hairpin ambiguity. |
| Clearance sampling target | ~400 intervals | Can miss segment intersections / nearest approaches. |
| Search behind/ahead | 25 m / 90 m | Heuristic continuity search; can fail after gaps or changed layout. |
| First search window | 40 m | Prevents wrap snap but assumes aligned start vicinity. |
| Terminal segment extrapolation | f ∈ [−1.5,2.5] | Heuristic extrapolation, not observation. |
| Datum residual trim | 8 m | Heuristic outlier exclusion. |
| Datum fit iterations | 3 | Computational choice, no convergence certificate. |
| Maximum datum translation | 5 m | Heuristic admissible bias; line/bias ambiguity remains. |
| Minimum common section | .50 | Classification rule, not a confidence level. |
| Full common section | .98 | Can leave part of finish unobserved. |
| Aligned length ratio | within .03 of 1 | Heuristic; can reject a legitimate line or accept wrong matches. |
| Segment/trace coverage slack | .5 m | Display/coverage allowance, considerably larger than ordinary Float32 error at kilometre scale. |
| Coasting band | ±.1 g, inclusive | Heuristic on drag-corrected signal; not a throttle/brake sensor. |
| High-demand / high-lean duty | >.8 g, >40° | Display thresholds, not independent tyre limits. |
| Payoff and delta-color deadbands | .05 s, 3 points | Heuristics with no propagated uncertainty; .05 s can be smaller than some position-timing errors. |
| Spare-score rounding | round(g·100) before subtraction | Up to almost 1 point gap distortion. |
| Demand amber position | .55 of anchor | Visual ramp choice; no tyre-state evidence. |
| Traction plot range | max(1.3,anchor+.15) g | Can place higher data outside intended plot area; not an analysis limit. |
| Envelope comparison range | max(1.3,anchor+.15,each radius+.08) | Auto-range heuristic, differs from session plot. |
| Envelope plotted bin angle | −π+b·2π/72 | Uses bin edge; bin-center representation would be offset by 2.5°. |
| Traction grid rings | .25 g | Axis decoration, not physical thresholds. |
| Traction trail | 45 samples | 1.8 s only at 25 Hz. |
| Transient arrow visibility | >.08 g/s | Visual noise gate, uncalibrated. |
| Load timeline longitudinal full-scale | ±1 g | Clips larger values visually. |
| Playback / shift-arrow step | 25 samples/s / 25 samples | Ignores actual rate and timestamp gaps; 10 Hz data plays 2.5× actual time at “1×.” |
| Playback multipliers | .5,1,2,4 | Correct dimensionless multipliers only with a correct timebase. |
| Timeline x-coordinate | sample index | Equal-width samples imply uniform time even across gaps. |
| Comparison gap advisory | >15 m | Heuristic warning; reference hard-codes zero and evades it. |
| Time-gradient full-scale | .1 s /100 m | Visual scale; correct gradient units from Δdelta/(Δs/100). |
| Map turn delta full-scale | .25 s | Visual scale. |
| Delta slope color buckets | 9 | Visual quantization. |
| Display precision | g .01, time .01 s, points/speed mostly integers | Formatting, not demonstrated measurement precision. Lap time lacks minute carry after rounding. |
| UI zero guards | typically 10⁻⁶ or 10⁻⁹ | Numerical division/tick guards; do not establish physical validity. |

All remaining numeric literals in the accompanying inventory are layout, canvas geometry, colors/opacity, indexing, array allocation, formatting or control-flow details. They are enumerated for completeness. They should not be interpreted as missing scientific constants. Review of calculations does not certify every visual-layout behavior.

## Recorded-session results

Names below refer to the two local fixture filenames. No location traces are included in this report.

| Quantity | 06 June recording | 22 June recording |
|---|---:|---:|
| Samples | 23,752 | 64,822 |
| Duration | 950.20 s | 2,592.92 s |
| Effective sample rate | 24.99579 Hz | 24.99923 Hz |
| Typical / maximum dt | .04 / .08 s | .04 / .08 s |
| Timed laps | 10 | 5 |
| Matched session turns | 7 | 11 |
| Detected corners per lap | 6-9 | 7-11 |
| Default session score | 94.87848 | 82.77703 |
| Fitted maximum radius | 1.26808 g | 1.08519 g |
| Fit samples | 19,937 | 13,308 |
| Empty angular bins | 0 | 0 |
| Maximum combined channel | 1.30755 g | 1.10714 g |
| Maximum transient channel | 3.02592 g/s | 2.99682 g/s |
| Maximum same-session delta disagreement with metadata | 1.383 ms | 3.507 ms |
| Mean absolute delta disagreement | .757 ms | 1.347 ms |
| Session-map length bias versus comparison geometry | −8.37 to −8.46 m | −10.19 to −10.20 m |

Both recordings have no parser-counted missing fixes or dropped rows; they do contain .08 s intervals. Neither contains a timed sample rejected by the current 2.5/1.4 g envelope caps. Consequently good behavior on these particular recordings does not validate the artifact-handling limits tested separately.

The recordings use different layouts despite matching track/configuration metadata. The code correctly returns partial comparison, with common-section fractions about .8846 or .7121 depending on the reference, and withholds a full finish delta. This is positive evidence for the intended spatial comparison on these examples.

| Smoothing window | 06 June max transient | 22 June max transient |
|---|---:|---:|
| 3 samples | 3.89575 g/s | 3.60506 g/s |
| 9 samples | 3.02592 g/s | 2.99682 g/s |
| 19 samples | 1.84155 g/s | 1.86702 g/s |

Changing one allowed setting roughly halves the extreme transient reading. Session-envelope scores move less (95.37→93.95 and 83.37→81.48), but this does not validate their physical interpretation. Equal-budget median-window scores rise from 88.96 at one lap to 94.88 at ten in the first recording, and 77.21 to 82.78 at five in the second. These observed trends do not establish monotonicity; the counterexample already disproves it. No universal “+8 points for identical riding” follows from these measurements.

## Independent probe index

Exact inputs and outputs live in `grip-audit-results.json`; P = supported bounded check, F = counterexample/limitation. These identifiers group evidence, not independent severity-ranked bugs.

| IDs | Subject |
|---|---|
| P01-P05 | g constant, uniform linear derivative, ideal lean conversion, vector norm, resistance arithmetic |
| P06-P09 | Component derivative, defined transient-index arithmetic, centered average, ideal weight-transfer sign |
| P10-P13 | WGS84 scale plausibility, grid endpoints, recorded timing agreement, telescoping segment times |
| F01-F03 | Stationary rolling demand, rotating-frame jerk claim, timestamp-gap derivative |
| F04-F07 | Invented envelope sectors, sparse spike, non-monotone score, valid hard-braking exclusion |
| F08-F18 | Missing/nonfinite values, geographic validation, counters, persistence, isolated corruption, metadata, lean singularity, duration |
| F19-F25 | Invalid smoothing window, constant-speed corners, mislabeled peak, turn merging, lap boundary duration, duplicate lap IDs, wheel lift clamp |
| F26-F29 | Plateau interpolation, partial duty metres, layout pace, causal advice |
| F30-F33 | Rate-dependent corners, reference gap diagnostics, map length inconsistency, minute-rounding carry |

The synthetic comparison of causal advice (F29) verifies the current unjustified label; the non-identifiability argument above is the reason that label cannot be proved. F20/F21/F25 test limitations of deliberately chosen definitions/displays, not hidden arithmetic errors. Keeping this distinction matters when selecting fixes.

## What would establish confidence

1. **Correct the definite contracts first:** exhaustive input validation and metadata validation; per-sample validity/gap propagation; timestamp-based windows/playback; shared plateau interpolation; reference quality computation; consistent map geometry; proper own-lap pace; clipped duty integration; unique lap identity; honest peak and time formatting.
2. **Separate observable quantities from interpretations:** net acceleration, assumed resistance-corrected demand, angular coverage, component-rate index, sample quality, measured duration. Remove tyre-margin and causal riding conclusions that do not follow from those observations.
3. **Calibrate physical parameters:** measured bike+rider mass and static axle loads, wheelbase/CoM, coast-down or wind-tunnel/road-load data over posture and speed, wind/grade, and documented lean-channel provenance. Report parameter uncertainty instead of assigning universal truth to defaults.
4. **Validate lean and derivatives against independent instruments:** synchronized reference GNSS/INS and attitude measurements, including rider movement, banking, gradients, braking, bumps and transitions. Reference time/position and force-related instrumentation must be independent enough to avoid validating one GNSS-derived quantity with another derivative of the same solution.
5. **Validate detection thresholds on held-out recordings:** annotated corners/apex windows and logger dropouts at 1/5/10/20/25 Hz, multiple circuits and layouts, both directions, wet/dry conditions and different motorcycles. Measure false detections, missed turns, association errors, time errors, and sensitivity to settings. Split validation by session/device/track, not neighboring autocorrelated samples.
6. **Define acceptance limits before tuning:** derive tolerances from the intended claim. A 3-point distinction needs an uncertainty budget significantly below .03 g; a .05 s causal/time distinction needs appropriate timing/position bounds. At 20 m/s, 1 m of along-track error is already .05 s. Good endpoint lap-delta agreement does not bound every local corner-time error.
7. **For actual available grip:** add a validated friction-estimation/tyre model and suitable observations, including excitation/limitations. Force demand below a historical maximum alone cannot resolve the remaining friction margin. No amount of renaming the current thresholds supplies this missing information.

The justified conclusion is narrower than the current product language: this implementation provides filtered, assumption-dependent demand proxies and useful spatial lap comparisons on the tested recordings. It does not yet provide a proven measurement of grip utilization or remaining grip.
