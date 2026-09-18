# Grip audit implementation, analysis revision 2

Implemented on `fix/grip-calculation-audit`, against audited baseline `638eb4b8345b2012c0d9160c819bc955eaf8232d`. The original research, counterexamples, source inventory and production-bundle evidence remain in this directory. This report supersedes the baseline's descriptions of current behaviour; its physical limitations still apply.

## Behaviour changes

| Audit evidence | Implementation |
|---|---|
| F01 | Zero resistance demand at standstill. Moving resistance remains an explicitly generic model. |
| F02, F29 | Demand is the default metric. The optional activity index and vehicle-aligned demand rate are named and explained accurately. Removed spare-grip promises, tyre-class capacity scales and causal riding advice. |
| F03, F30 | Time-based smoothing, derivatives, corner windows, default alignment padding, playback, seeking and trails. Filters split at recorded gaps and invalid fixes. |
| F04-F07 | Unobserved directions remain NaN. Duration-weighted p95 with explicit support; no universal 1.4/2.5 g exclusion. Whole-circle/sector scores require complete directional support. Removed monotonicity claims. |
| F08-F18 | Required numeric values reject blank, nonfinite and out-of-domain inputs. Quoted CSV fields and minute:second metadata parse correctly. Single-zero coordinates remain valid; the RaceBox 0,0 missing-fix convention is retained. Invalid timestamps count as dropped rows. Minimum duration uses elapsed seconds. Exhaustive shared API/client validation includes metadata, all samples and quality masks. Raw timestamp and lean precision survive storage. |
| F19 | Sanitization enforces odd integral speed windows and permits tau = 0. |
| F20-F22 | Sustained-lean bends supplement speed minima, including constant-speed bends. Thresholds are inclusive. Peak means the actual maximum derived value. Opposite-direction turns cluster separately. |
| F23-F25 | Completed fallback lap timing includes the next boundary sample and is marked approximate. Repeated positive lap labels reject. The axle model exposes 0/100% boundaries rather than hiding predicted lift behind 2/98% clamps. |
| F26-F28 | Exact/grid interpolation share right-continuous plateau handling. Duty integrates partial edge cells and threshold crossings exactly on the reference axis. Mean pace uses the lap's own duration. Corner entry/exit speeds interpolate exact spatial boundaries. |
| F31-F33 | Reference quality includes real sample gaps and validity. Subject support is bounded by reference support; unsupported comparison metrics/times are masked. Full finish deltas require supported endpoints. Both maps share WGS84 scales. Time formatting carries rounded seconds into minutes. |
| Display findings | Demand and rate plots expand their scales. Sparse envelopes draw disconnected arcs. Missing demand renders n/a without nonfinite canvas coordinates. Other-lap differences are calculated before rounding. |

## Definitions and remaining limits

The envelope is a statistical summary, not a validated tyre boundary or artifact detector. A qualifying sample receives half the adjacent valid, qualifying time intervals, excluding gaps and lap transitions. Within each angular bin, values are sorted and the first value reaching 95% of the accumulated weight is selected. At least 0.5 s and two weighted observations must support that bin. No radius is inferred for other directions. A single observation cannot invent a full-circle score. A sustained sensor artifact can still affect p95; F05's universal spike-immunity claim is **not proved or promised**.

The 72 bins, p95, 0.5 s support, 1.5 median-period gap guard, detection thresholds, clustering distances and alignment tolerances are engineering choices. They are documented as such. Synthetic tests establish behaviour under stated inputs; they do not calibrate these choices against an independently annotated multi-device, multi-track population. Equal-lap comparison selects one actual contiguous window by the median mean squared supported radius. It does not display that selection statistic as a whole-circle score or remove condition/duration confounding.

Speed filtering uses a symmetric integral of the piecewise-linear signal. The half-width is `(speedSmooth - 1)/50` seconds, lean and derivative smoothing use 0.08 s, and derivative endpoints target ±0.12 s at actual samples. Windows shrink symmetrically at each contiguous run boundary. Constants and linear ramps are preserved, including at boundaries. Nonlinear transients are attenuated. Corner apex demand uses a sample median within ±0.12 s, not a claim of a measured geometric apex. Sustained lean needs 0.5 s; speed-minimum expansion allows a 1.25 m/s² local slope tolerance and at most four seconds per side. These detection values remain heuristics.

Resistance uses rho = 1.20 kg/m³, CdA = 0.40 m², mass = 260 kg, Crr = 0.015. Lean conversion still assumes balanced steady cornering and representative combined rider/bike attitude. The axle split assumes a static 50/50 distribution and K = height/wheelbase, omitting aerodynamic moments. These assumptions have not become physical measurements through this software change. Banking, grade, wind, body position, instrument provenance and physical tyre capacity still require the calibration and independent measurements described in the original audit.

Quality handling is deliberately conservative: comparisons retain the longest contiguous supported shared section. A single recording gap can therefore withhold a complete-lap delta and exclude valid data in a shorter disconnected section. The implementation does not interpolate across that missing support to advertise a complete result. Near-zero estimated demand is not evidence that the rider is coasting. Segment-best sums are arithmetic composites, not a physically attainable predicted lap.

## Data compatibility and rollout

- New recordings store raw data envelope version 2, including per-sample fix validity and missing/dropped counters. Client and server import the same dependency-free validation module.
- Valid version 1 recordings remain readable. Already-lost missing-fix locations and counters cannot be recovered and are disclosed as unavailable.
- Existing malformed recordings can now be rejected instead of being partially accepted or crashing analysis. No saved recording is rewritten or deleted.
- Analysis revision 2 recomputes derived values on load. Its scores differ from revision 1 and must not be compared as the same statistic.
- Frontend and API must deploy together because the previous API rejects version 2 uploads. No schema migration is needed.
- Work is on a feature branch; pushing it does not invoke the production workflow, which triggers on `main`.

## Verification

Current regression entry point: `node scripts/audit-grip.mjs`. It runs the grip analysis, playback and UI suites without overwriting historical evidence. `scripts/audit-grip-baseline.mjs` retains the original independent experiments and refuses to run against source hashes different from the audited baseline. To reproduce the historical experiment, use the audited source revision in a separate checkout with that script and its inventory; its nonzero exit code means a claim was refuted, not a failing new regression test.

Regression coverage includes exact analytic acceleration/lean at 10/25/50 Hz, irregular timestamps and missing fixes, malformed/sparse payloads, shared validation, duration-weighted quantiles, unsupported sectors, lap boundaries, direction-aware clustering, plateau interpolation, exact duty integrals, own-lap pace, reference gaps, time rounding, recorded-time playback and actual canvas drawing with nonfinite-coordinate guards.

The two private local RaceBox fixtures were exercised and remain gitignored. In the ten-lap timing fixture, three laps contain recorded timestamp gaps and are now partial. The remaining seven complete comparisons retain finish-delta agreement within 0.01 s of the supplied lap metadata (largest observed difference about 1.4 ms). This is an endpoint check on those recordings, not a bound on local corner-time errors or independent proof of sensor accuracy. Cross-layout comparisons still withhold full-lap deltas.

Validated on 18 September 2026:

- `npm test`: 626 tests passed across 90 files, including the local fixture cases.
- Grip-specific coverage: 171 tests across 19 files, including playback and drawing.
- `npm run build`: TypeScript, Vite production build and landing prerender passed.
- `npm run build` in `server/`: API TypeScript build passed.
- `git diff --check`: passed.

The runs emitted existing React test `act(...)`, React Router future-flag and Node localStorage/deprecation warnings; no test or build failures remained.

## Production release preparation

The production deployment now updates and restarts the API before publishing the frontend, so version 2 uploads cannot reach the previous API. A read-only check of all nine saved production grip sessions found nine version 1 envelopes, all accepted by the new validator, with no invalid recordings. None has a stored per-sample fix-validity mask. They need no data migration; a browser refresh and reopening a session recalculates derived results. Re-importing an original CSV is optional for recovering quality information the legacy storage omitted. This release makes no database schema changes.
