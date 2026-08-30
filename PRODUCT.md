# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One React + Tailwind design language serves every surface today. Native iOS and
Android apps are **planned but not shipped**; Capacitor projects are checked in
and unpublished. Whether those apps adopt per-OS design languages or keep
rendering this web system is an **open decision**, not a settled one. Until it is
settled, design for web and treat mobile-web quality as the mobile quality bar.

## Users

Primary, all confirmed and all real today:

- **Track-day motorcycle riders.** The whole hands-free path exists for them:
  start while stopped, pocket the phone, ride, come to a stop. A rider cannot
  touch a phone mid-pull, and cannot look at one either.
- **Hobby and track-day car drivers.** Can watch the screen, so they get the
  interactive tap-mode calibration and the live run screen.
- **Tuners and workshops.** Before/after checks for a customer without booking a
  rolling road. They need repeatability more than absolute accuracy.
- **The operator and friends.** The product is dogfooded by its author.

**Future audience, not yet implemented:** motor race schools improving their
students, both 1:1 and in instructor-led groups. Nothing in the product serves an
instructor or a multi-rider cohort today (no shared vehicles, no coach view, no
group). Treat this as a direction to avoid designing against, never as an
existing capability or an audience to write copy for.

The usage scene is the constraint that outranks the persona: outdoors, bright
sun, a phone held in a gloved hand or stowed in a pocket, between sessions rather
than during them. Deep analysis happens later, indoors, on a bigger screen.

## Product Purpose

Give a driver or rider evidence that a change to their vehicle or their riding
actually did something. Two tools under one account:

- **DynoRun**, a GPS virtual dyno. Drive one gear, the phone records GPS speed,
  the app derives a wheel-power-vs-RPM curve from `F=ma`. A calibration step
  captures gear ratio as a single `rollout_m_per_rev` number, so no transmission
  or tyre data is needed.
- **Grip Utilization**, a track-session analyzer. Import a RaceBox CSV, get a
  traction envelope, per-corner load analysis, and spatial lap-vs-lap comparison
  that answers where the time went and why.

Success for a session is a decision the user can defend: keep the change, or
revert it. Not a bigger number.

## Positioning

Comparative measurement that a neighboring product cannot honestly copy in two
ways:

1. **Wheel power without hardware.** Just GPS and a mass figure. No rolling road,
   no OBD dongle, no inertia drum. The number is explicitly comparative, not
   calibrated, and the product says so on the marketing page.
2. **Absolute grip scores, not utilization percentages.** Every headline grip
   metric is `measured g demand x 100`, comparable across laps, sessions, bikes
   and riders. The per-rider traction envelope is descriptive only and is never
   used as a divisor, because a percentage-of-your-own-best reading guarantees
   readings over 100% and hides slow days.

The honesty is the position, not a disclaimer bolted to it.

## Operating Context

- **Two capture modes per workflow, and the choice is the design.** Interactive
  (watch the screen, confirm) for drivers; hands-free (record the whole ride,
  choose afterwards) for riders. In hands-free, **nothing is captured while the
  vehicle is moving and everything is chosen after it stops.**
- **Runs:** calibrate a gear once, then record acceleration pulls. Auto-stop and
  standstill detection end recordings without a tap.
- **Grip:** the artefact is a RaceBox track-session CSV exported by the user's own
  logger, dragged into the browser. Multi-MB uploads are normal.
- **Comparison is the payoff surface**, both for runs (overlaid curves on one RPM
  axis) and laps (`/grip/compare`, whose shareable artefact is the URL, nothing
  is persisted).
- **Review happens away from the vehicle**, so the analyzer screens can be dense
  where the capture screens must not be.
- Sign-in via email+password or Google/Apple/Discord. Sign-up is open.

## Capabilities and Constraints

**Built and live:** vehicles and garage, calibration wizard (tap + hands-free),
live run capture, hands-free session capture with automatic pull detection, run
review and curve storage, multi-run comparison, accel-time cards, raw sensor
recordings and offline replay, grip session library + analyzer + lap compare,
public run sharing, settings with a power-unit toggle, legal pages, an admin KPI
panel, and a public prerendered landing page at `/hello`.

**Not built, and must not be implied:** any instructor, coaching, group or
multi-user surface; any pricing, plan, billing or quota surface; any hardware
integration beyond a RaceBox CSV import; driveline-loss or aero-corrected
"engine power".

**Hard constraints future design work inherits:**

- **Trackside phone usability is non-negotiable.** Bright sun, gloves, one hand,
  sometimes no hand at all. No critical action may require a tap while moving.
- **Measurement honesty is non-negotiable.** Never imply calibrated-dyno accuracy
  or an absolute tyre limit. Wheel power is an estimate from GPS acceleration,
  mass, gearing and road-load assumptions. Grip reflects GPS/IMU quality, tyres,
  inputs and the user's own settings. When a value cannot be computed the UI
  prints `n/a`, never a fabricated number and never a dash glyph.
- Two plates, not one theme: a **day plate by default** because the real scene is
  a phone in a gloved hand in direct sun, where a dark UI is a mirror, and a
  **night plate** as a genuine variant of the same world. Both are first class;
  neither is a bolted-on mode. One Tailwind v4 system, no chart library for grip
  canvases (plain canvas 2D) and uPlot for run curves.
- **No en or em dashes anywhere** in this repo, including UI copy.
- Copy is English only; no i18n layer exists.

**Terminology that must stay exact:** rollout (m/rev), wheel power, pull,
plateau/hold, run, session, lap, turn (a stable track id) versus corner (a
per-lap detection), traction envelope, score (g x 100), spare (grip left unused).

## Brand Commitments

- **`wasgoht` is the suite brand**, at https://wasgoht.ch. **DynoRun** and
  **Grip** are the two tools inside it. Marks live in `src/ui/components/` and are
  drawn in the plate's own symbology, single-ink, no gradient and no radius:
  `SuiteMark` (a registration cross), `BrandLogo` (DynoRun, the profile trace it
  draws), `GripMark` (the traction circle it draws), `Wordmark`.
- Colour carries meaning and is never decoration. As of the 2026-08 redesign the
  per-tool brand colours are **abolished**: amber-for-DynoRun and blue-for-Grip
  both competed with the data plotted beside them. Colour is now spent only
  where it changes a decision, and the two tools are told apart by their glyph
  and by the plate's title block. Do not reintroduce a brand hue.
- Voice is flat, technical and unhyped. Short imperative headlines ("Record.
  Compare. Decide."), no superlatives, no exclamation marks, and a stated
  limitation next to every claim.
- Operated by Johannes Nothstein as a private individual (imprint and privacy
  policy name him, `privacy@wasgoht.ch`).

## Evidence on Hand

- **Real product captures**, in `public/media/`: DynoRun analysis, grip traction
  circle, grip corner cards, plus a track hero image. The DynoRun capture is from
  a **synthetic GPS trace** and the grip captures from a **sample RaceBox-style
  session**; the landing page labels both, and that labelling must survive any
  rewrite.
- **A live demo route** (`/demo`) that runs a real analysis without an account.
- **Two real RaceBox track fixtures** used in tests (Anneau du Rhin, two
  different layouts despite identical metadata).
- **No testimonials, no named customers, no user counts, no benchmark against a
  real dyno, no press.** None of these may be invented. If social proof is ever
  needed on a surface, it has to be requested and supplied, not written.
- Privacy posture as documented today: exactly one session cookie, no analytics,
  no advertising, no tracking, Swiss nDSG + GDPR. This is a current fact, not a
  pinned constraint; if it changes, the privacy page changes with it.

## Product Principles

1. **The comparison is the product, the number is not.** Every surface should
   make "is this better than last time" answerable, and should resist being read
   as an absolute rating.
2. **State the limit next to the claim.** Honesty about what the measurement is
   worth is a feature of the product, not friction to be designed away.
3. **Nothing important happens while the vehicle is moving.** Defer every choice
   to a stop. A wrong capture the user can ignore beats a silent capture that
   poisons every later reading.
4. **Density belongs to review, calm belongs to capture.** The analyzer may be
   information-dense; the trackside screens are large-target, glanceable, and
   ruthless about what they show.
5. **Free today, priceable tomorrow.** Design so a paid tier can arrive without a
   rebrand or a rebuild, and without any surface currently promising that the
   product is free forever.

## Open Decisions

Recorded, not invented. Future work must resolve these rather than assume:

- **A paid tier is intended but unspecified** (no plan shape, price, or gated
  feature). It collides with the imprint's "non-commercial personal project, not
  a registered business" wording, which will need revisiting before any pricing
  surface ships.
- **Whether the planned iOS/Android apps get a per-OS design language** or keep
  rendering this web system.
- **What a race-school or instructor experience would be**, if it is ever built.

## Accessibility & Inclusion

No formal standard has been committed to. What the codebase already upholds and
future work must not regress: a visible `:focus-visible` ring on every control, a
`prefers-reduced-motion` block that neutralises animation, semantic landmarks and
`aria-label`s on the landing page, and a 16px minimum on form controls so iOS
Safari does not zoom. The real accessibility pressure here is environmental
rather than assistive: sunlight, gloves, motion, and a rider who cannot look at
the screen at all.
