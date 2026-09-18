# Motorcycle tire grip: deeper research on the 1.1 reference

Research date: 2026-09-18. Research only; no application changes.

## Finding

**1.1 is a physically plausible friction coefficient, with conditional experimental support. It is not a validated universal motorcycle tire limit.** The earlier description of the number as simply unsupported needs this distinction. Direct tire tests and reported motorcycle braking tests support values in this vicinity. They do not establish the former rain 0.8 / sport road 1.0 / race road 1.1 / slick 1.3 classification, a circular combined-grip boundary, or remaining grip for a particular recording.

There is also a useful historical lead: the four numbers reproduce the tangents of early BMW S 1000 RR traction-control lean thresholds. That is a possible origin of the classification, not proof of where our code obtained it.

## Evidence ledger

These are deliberately short source summaries. References identify the exact relevant sections; no values below should be read as guarantees for other tires or conditions.

| Source and evidence type | Conditions and result | What it establishes, and its limits |
| --- | --- | --- |
| **[TRL PPR496, Lambourn and Wesley, 2010](https://www.trl.co.uk/uploads/trl/documents/PPR496.pdf)**. Direct force measurements. Methods, printed pp. 6-10; results pp. 12-15, Figs. 6-13; Appendix Fig. A1. Related SAE paper: [10.4271/2010-01-0054](https://doi.org/10.4271/2010-01-0054). | Bridgestone Battlax BT003, BT014 and BT021 front tires, 120/70ZR17; upright braking trailer; 300 kg/wheel, 210 kPa, ambient about 15°C; 32, 64 and 100 km/h; dry and approximately 1 mm water on hot rolled asphalt (HRA) and stone mastic asphalt (SMA). Dry HRA motorcycle average peak coefficients: approximately 1.2 at 32 km/h to 1.3 at 100. Dry SMA: 1.10-1.23 across all four tires, including the car comparator. Wet SMA motorcycle peaks: 1.03-1.12 at 32, all 1.01 at 100; locked-wheel values at 100: 0.37-0.40. BT003 dry HRA peaks at 64: 1.07, 1.30, 1.58. | Strong conditional evidence above 1.1, including a touring tire. Peak and sliding friction differ substantially. Not a cambered combined-force test, modern-tire population study, or dedicated rain-tire comparison. The repeated-test scatter cautions against precise class constants. |
| **[UNECE ECE/TRANS/WP.29/GRRF/2014/3](https://unece.org/fileadmin/DAM/trans/doc/2014/wp29grrf/ECE-TRANS-WP29-GRRF-2014-03e.pdf)**. Official technical rationale reporting BMW tests; section IV.B(d), printed p. 5. | Same track, day and driver: BMW F800ST with Continental Sport Attack, peak braking coefficient **1.1**. BMW HP2 with Michelin Annakee: 1.0; Metzeler Enduro 3: 0.83; Metzeler Karoo: 0.73. Detailed tire temperature, pressure, test repetitions and uncertainty are not supplied there. | A direct historical report of 1.1 for a named motorcycle/tire setup. These are vehicle braking results, not a laboratory lateral/combined tire-force surface. Other parts of the document acknowledge rear-wheel lift and insufficient brake authority as obstacles to measuring the peak. This is historical evidence, not a statement of current regulatory requirements. |
| **[Mottola and Massaro, 2022](https://doi.org/10.3390/machines10100921)**. Direct motorcycle tire-rig experiment. Sections 2-4; Table 2 and Fig. 4. | Six motorcycle tires, front 120/70-17 and rear 190/55-17, rotating disk with P120 sandpaper. One measured camber reduction factor was approximately -0.19 with stated uncertainty ±0.11; rear specimens were consistent with zero. | Tire response to camber differs even within nominal sizes. This factor describes camber versus turn-slip response; it is **not** a 19% increase or decrease in maximum grip. Sandpaper results cannot supply an asphalt grip constant. |
| **[Pirelli motorcycle technical data book, 2025](https://tyre24.pirelli.com/moto/assets/pirelli/pdf/global/TDB/PIRELLI_TDB_2025_HR.pdf)**. Manufacturer setup guidance, printed p. 13, Diablo Superbike chart and pressure table. | Compound choice is related to surface, operating conditions, setup and riding style. Example: 120/70 R17 front hot-after-warmer range 2.2-2.5 bar; 180/60 R17 rear 1.7-1.9 bar; warmer guidance 50 minutes at 80°C. | Useful evidence that a named slick requires defined operating conditions. This table gives no peak friction coefficient or g limit. The warmer temperature is not an experimentally established universal grip-optimum temperature. Values are quoted as research context, not individual setup advice. |
| **[Bartolozzi et al., published online 2024](https://doi.org/10.1177/09544070241247239)**. Motorcycle modeling with real characterization trials and simulation. Author manuscript: Experimental Test, pp. 9-10; Fig. 5; Discussion pp. 15-16. [Readable author manuscript](https://www.researchgate.net/publication/380287686_An_enhanced_motorcycle_tyre_model_characterised_through_experimental_riding_data). | GNSS/IMU, steering-angle sensor, both wheel speeds, measured vehicle geometry and center of mass; repeated coast-down, front/rear braking and cornering maneuvers. Braking characterization approaches friction limits. Their real-data slip/force channels are largely estimated, not measured by wheel-force transducers; lateral tests were approximately 30 km/h. Combined-maneuver validation uses simulation. | A credible route to richer motorcycle models using more instrumentation than our CSV stores. Figure 5 shows load-sensitive longitudinal behavior. It does not validate recovering a modern tire's full combined capacity from GPS/lean alone. Authors acknowledge the lack of force/slip sensors and growing lateral-force differences at larger camber. No peak coefficient was numerically digitized from the figure for this memo. |
| **[Volkmann et al., 2024](https://arxiv.org/html/2407.11805v1)**. Vehicle estimator development and experiment, sections 2.3, 3.2.6 and 5. | A VW Golf experiment combines camera, wetness sensors, air temperature and vehicle dynamics. The dynamics estimator supplies evidence only when force sensitivity to maximum friction is sufficiently high. Its actual experimental friction ground truth is unknown. Tire pressure, tread, load and temperature effects are outside its fitted model. | Supports explicit observability gating and probability distributions as future methods. It is neither a motorcycle calibration nor proof that a weather-based estimate supplies accurate tire limits. |

## The four-value mapping: a plausible historical explanation

The repository history traced by the main audit identifies commit `f3ead2bfdf910b7748337305b5523dce361193f7` on 2026-07-08 as the introduction of `anchorG`, default 1.10, and the rain/sport-road/race-road/slick examples. No direct citation or test accompanies those four values. The constant was introduced as a color reference, not as an input to the absolute score.

The [BMW San Francisco 2012 S 1000 RR product information](https://www.bmwmotorcycle.com/2012_s1000rr_bmw_info/), section 5, DTC Matrix, lists approximate angle thresholds for preventing acceleration. This dealer specification is weaker provenance than an original engineering test report. The numerical row is also reproduced in period riding reports; it should be treated as a lead about controller calibration, not tire testing.

The following tangent calculations are ours:

| Riding mode | Reported DTC angle | tan(angle), calculated | Old app example |
| --- | ---: | ---: | ---: |
| Rain | 38° | 0.7813 | 0.8 |
| Sport | 45° | 1.0000 | 1.0 |
| Race | 48° | 1.1106 | 1.1 |
| Slick | 53° | 1.3270 | 1.3 |

BMW's own [May 2009 media information](https://www.press.bmwgroup.com/usa/article/attachment/T0020783EN_US/58761), printed pp. 21-23, confirms these are engine and traction-control modes. It expressly places Rain-mode intervention before the tire friction limit and explains different intervention behavior across modes. The BMW Group PDFs inspected do **not** contain the exact four-angle table. That distinction prevents overstating the primary-source evidence.

**Inference:** the matching names and rounded numbers make a DTC-to-tangent conversion a plausible ancestor of the old classification. No repository evidence proves that this was its actual source. More importantly, a torque intervention threshold cannot be relabeled as a measured maximum friction coefficient.

## What “1.1 g” does and does not mean

The derivations below use Newton's laws and explicit idealizations. They are not additional tire measurements.

For a point-mass vehicle on flat ground, negligible vertical acceleration/aerodynamics, and a single isotropic friction limit:

```text
Fz = m g
Fy = m ay
Fx = m ax
mu_demand = sqrt(Fx² + Fy²) / Fz = sqrt(ax² + ay²) / g
mu_demand <= mu_peak
```

This explains the convenient numerical equivalence between a demand of 1.1 g and an engaged force ratio of 1.1 in that ideal model. It does not establish equality with `mu_peak`. Friction coefficient is dimensionless; g is an acceleration unit.

Under steady, balanced cornering with a zero-width tire and aligned rider/vehicle center of mass:

```text
tan(phi) = ay/g
atan(1.1) = 47.7263 degrees
```

Consequently, 1.1 is not a special physical transition. The corresponding angle is just the consequence of a chosen acceleration ratio. Motorcycle roll, the combined rider/vehicle center-of-mass lean, and lean relative to a banked road are different quantities. Tire width, body position and nonsteady roll add further differences.

The magnitude of even modest model error matters. In this same simplified conversion, changing lean from 48° to 46° or 50° changes demand from 1.1106 to 1.0355 or 1.1918. That is about 0.08 g for a 2° change. This is a sensitivity calculation, not a claim about RaceBox accuracy.

For a point mass turning on bank angle beta, resolving the road-contact force into road-normal and road-tangent components gives, with `k = ay/g`:

```text
mu_demand = abs(k cos(beta) - sin(beta)) / (cos(beta) + k sin(beta))
```

At horizontal acceleration 1.1 g, a 5° bank toward the turn gives 0.9236; a 5° adverse bank gives 1.3139. These illustrative values assume no longitudinal force or other vertical/aerodynamic effects. They show why a horizontal acceleration number is not automatically the road-plane tire friction ratio.

Even an accurate whole-vehicle force estimate does not determine each tire's margin. Front and rear have different normal loads and force allocations. For example, an assumed whole-vehicle circle cannot reveal a front tire already at its limit while the rear is lightly used. Load transfer, wheel lift and engine power can limit the acceleration envelope independently of tire friction.

## Why an ordinary recording cannot identify maximum grip

There is a simple identifiability counterexample. Consider the admissible simplified tire law:

```text
F = min(C * slip, mu_peak * Fz)
```

For all samples with `C * slip / Fz <= 0.8`, otherwise identical tires with `mu_peak = 0.85`, `1.1` or `1.5` produce identical forces and trajectories. A speed/position/lean recording cannot distinguish them. It therefore cannot determine their headroom. More sub-limit laps do not resolve this ambiguity.

In an ideal, correctly measured, flat-road model with fixed conditions, demonstrated demand is evidence that at least that demand was sustained at that moment. Our estimated demand and directional p95 can be useful observations, but are not a rigorous measured lower confidence bound on a tire's future capacity. A p95 is also explicitly below some recorded samples; it is not a maximum by construction. Sensor/model errors can inflate values, and conditions can change.

Changing an assumed limit changes the inferred margin dramatically without changing the data. With an ideal friction circle and 1.0 g lateral demand, hypothetical limits 1.1 and 1.3 yield residual longitudinal components `sqrt(1.1² - 1²) = 0.4583 g` and `sqrt(1.3² - 1²) = 0.8307 g`. Those are scenario calculations, not usable predictions of spare grip.

## Practical recommendation for the app

1. **Keep demand and display scale separate.** The current approach is justified. Neither 1.1 nor a newly researched average should become a capacity denominator. A neutral 1.0 g reference would be easier to explain, or a data-fitted chart extent could use one shared scale for all compared laps. Either is a presentation decision, not a scientific correction that this research demands.
2. **Use a reference recording as demonstrated performance.** A selected reference lap or comparable set can answer where one recording demanded more or less than another. A bike/tire/track/condition tag would improve interpretation, but cannot promote the envelope to tire capacity. Keep any explanations in the optional help, consistent with the UI cleanup.
3. **Make hypothetical capacity explicit only if such a feature is wanted.** An advanced scenario model could accept independent longitudinal/lateral assumptions and show sensitivity. The assumptions should not be silently inferred from tire class, and the output must remain an assumed model. A universal “rain range” would conflate wet pavement, dedicated rain tires, water depth, and temperature.
4. **A genuine calibration project needs new data and validation.** At minimum investigate synchronized wheel speeds, independently validated motion/orientation, steering angle and measured geometry/load distribution; record tire identity, pressure, temperatures and surface conditions. Fit identifiable behavior under controlled professional testing, validate on held-out conditions, and quantify parameter uncertainty. Instrumented motorcycle work above offers a starting point, not a drop-in validated algorithm.

## Remaining evidence gaps

- No publicly accessible direct combined-force dataset located in this search supports a universal 1.3 coefficient for motorcycle slicks, or a quantitative ranking of contemporary road, road-legal track and slick tires across realistic temperatures and camber angles.
- The strongest direct friction measurements reviewed are historical and upright. Their test-specific ranges should remain attached to those conditions, not turned into recommended general ranges.
- Pressure and temperature dependence is real context in manufacturer guidance, but a numerical correction factor cannot be obtained from setup tables alone. No validated correction surface for the user's tires was found.
- The SAE low-cost longitudinal/lateral test-method papers ([2015-32-0709](https://doi.org/10.4271/2015-32-0709), [2016-32-0054](https://doi.org/10.4271/2016-32-0054)) were identified, but their complete experimental tables were not publicly readable in this session. No numeric claims were adopted from their abstracts.
- The exact source of the app's four-value mapping remains unproven. The numerical DTC match is useful evidence about a possible origin, not a reconstructed citation history.

The useful correction is therefore precise: **1.1 has empirical plausibility in specified setups; the app has no evidence that it represents the maximum combined grip of the tires in any uploaded run.**
