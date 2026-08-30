---
name: wasgoht
description: Instrument approach plates for GPS wheel power and track grip, readable in a gloved hand in direct sun.
colors:
  sheet: "#ffffff"
  sunk: "#f1f3f5"
  ink: "#14161a"
  ink-2: "#4c5560"
  ink-3: "#66707b"
  rule: "#c3cbd2"
  rule-faint: "#e3e8ec"
  terrain: "#92a4b0"
  terrain-tint: "#dce3e8"
  procedure: "#c6188e"
  procedure-tint: "#fbe7f4"
  caution: "#a85d00"
  caution-tint: "#fbf0dd"
  gain: "#007f86"
  gain-tint: "#dff0f1"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2.4rem, 5vw, 3.6rem)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.035em"
    fontVariation: "wdth 108%"
  readout-xl:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(3.5rem, 12vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.84
    letterSpacing: "-0.035em"
    fontVariation: "wdth 118%"
    fontFeature: "tnum 1"
  readout:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 4rem)"
    fontWeight: 700
    lineHeight: 0.86
    letterSpacing: "-0.025em"
    fontVariation: "wdth 112%"
    fontFeature: "tnum 1"
  plate-title:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "0.02em"
    fontVariation: "wdth 87%"
  label:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.07em"
    fontVariation: "wdth 87%"
  annotation:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.09em"
    fontVariation: "wdth 75%"
  body:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
    fontVariation: "wdth 100%"
  data:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "normal"
    fontVariation: "wdth 100%"
    fontFeature: "tnum 1"
  control:
    fontFamily: "Archivo, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.07em"
    fontVariation: "wdth 87%"
rounded:
  none: "0"
spacing:
  cell-x: "0.75rem"
  cell-y: "0.625rem"
  control-x: "1rem"
  block: "2.5rem"
  block-wide: "3.5rem"
  column-gap: "2rem"
components:
  plate-frame:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  box:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  box-sunk:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
  button-outline:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0.625rem 1rem"
    height: "44px"
  button-outline-hover:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
  button-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0.625rem 1rem"
    height: "44px"
  button-solid-hover:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.sheet}"
  button-procedure:
    backgroundColor: "{colors.procedure}"
    textColor: "#ffffff"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0.625rem 1rem"
    height: "44px"
  button-procedure-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
  button-disabled:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink-3}"
  button-major:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.625rem 1rem"
    height: "76px"
    width: "100%"
    size: "1.125rem"
  field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.625rem 0.75rem"
    height: "44px"
  field-disabled:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink-3}"
  table-header:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-3}"
    typography: "{typography.annotation}"
    padding: "0.4rem 0.625rem"
  table-row:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    padding: "0.5rem 0.625rem"
  table-row-hover:
    backgroundColor: "{colors.sunk}"
    textColor: "{colors.ink}"
  table-row-selected:
    backgroundColor: "{colors.procedure-tint}"
    textColor: "{colors.ink}"
  advisory:
    backgroundColor: "{colors.caution-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.625rem 0.75rem"
  gauge-track:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.none}"
    height: "10px"
    width: "100%"
  gauge-fill:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.none}"
  nav-tab:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "0.625rem 0.75rem"
  nav-tab-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
---

# Design System: wasgoht

## Overview

**Creative North Star: "The Instrument Approach Plate"**

Every screen in this product is one sheet that has to be read correctly under
stress. The apparatus is fixed and named: a title block, a plan view, a profile
view sharing the plan's axis, a boxed minima table, a notes box, a revision bar
at the foot. DynoRun and Grip are not two products sharing a repository; they
are the same document type carrying different content, and a reader who learns
one sheet can read every other one. The landing page is the same document type
too, drawing real pipeline output rather than a screenshot.

The material is paper and ink, not glass and plastic. Structure is made of
hairline rules and boxed frames. There are no cards, no radii, no shadows, no
tonal elevation, and no gradient anywhere in the product. Hierarchy comes from
one variable typeface worked across width, weight, case and rule, so the whole
sheet survives being printed in a single ink. Colour is spent only where it
changes a decision: procedure magenta means "the line you actually flew", amber
means an advisory you must read, and everything else is ink and blue-grey
terrain. Hatching marks the regions where nothing was measured, because a blank
region reads as "nothing happened" and a hatched one reads as "not measured
here", which is the honest statement and this product's whole position.

Two plates ship, and both are first class. The **day plate is the default**
because the real scene is a phone in a gloved hand in direct sun, where a dark
interface is a mirror. The **night plate** inverts the sheet and is a genuine
variant of the same world (charts ship a night rendition), never a bolted-on
dark mode. The confirmed anti-reference is the dark telemetry dashboard of
rounded stat cards: no card grid, no hero-metric tile, no per-tool brand hue,
no glow.

**Key Characteristics:**

- One sheet per screen, composed only from named plate slots
- Hairline rules and boxed frames; zero radius, zero shadow, zero card
- One family (Archivo variable) across eight fixed type registers
- Colour spent only where it changes a decision; magenta for the subject, amber for advisories
- Missing data is hatched or printed `n/a`, never blank and never zero
- Day plate by default, night plate as a real variant, both driven by one token block
- Every numeral tabular, every axis a bare integer

## Colors

A printed chart's palette: a white sheet, near-black ink, blue-grey terrain for
everything that is context rather than content, and three signal inks that are
each reserved for one job.

### Primary

- **Procedure Magenta** (`procedure`): the subject, and only the subject. The
  run you are looking at, the lap you selected, the selected table row, the
  chart cursor, the commit action, focus rings, text selection, the caret. In
  overlaid charts it is always series 0, so a single-series curve draws magenta
  and its comparisons fall back to ink. In the grip demand ramp it is the top
  end, anchored to the tyre-class grip setting.
- **Procedure Tint** (`procedure-tint`): the wash behind a selected minima row
  and behind a uPlot drag-select region. Never a border, never a fill on
  anything unselected.

### Secondary

- **Advisory Amber** (`caution`): advisories you must read before trusting the
  sheet (poor GPS, a masked section, a blocked gauge, a field error), and the
  mid-stop of the grip demand ramp. Nothing else. An amber that fires routinely
  trains the reader to ignore the one that matters.
- **Advisory Amber Tint** (`caution-tint`): the advisory box's fill, paired with
  a hairline amber frame.

### Tertiary

- **Gain Teal** (`gain`): time or grip gained. It appears in the compare
  screen's diverging delta ramp (magenta for time lost, teal for time gained,
  a genuinely neutral `ink-3` midpoint so a zero delta cannot read as a small
  loss), in the load-transfer rate ramp, and as series 3 in overlays.
- **Gain Tint** (`gain-tint`): the corresponding wash.

### Neutral

- **Sheet** (`sheet`): the page. Every surface starts here.
- **Sunk** (`sunk`): the one recessed value. Notes boxes, hover on rows and
  outline controls, disabled fields. It is a shade, not an elevation.
- **Ink** (`ink`): body copy at full strength, every headline figure, frame
  rules, the inverted fill of an active control, gauge fills.
- **Ink 2** (`ink-2`): running prose and secondary values.
- **Ink 3** (`ink-3`): the annotation register, units, placeholders, `n/a`,
  chevrons, the neutral midpoint of the delta ramp.
- **Rule** (`rule`) and **Rule Faint** (`rule-faint`): the two divider weights.
  `rule` separates cells and boxes; `rule-faint` separates table rows and draws
  chart gridlines.
- **Terrain** (`terrain`) and **Terrain Tint** (`terrain-tint`): the blue-grey
  ground. Track outlines outside the section being read, the low end of the
  grip demand ramp, link underlines, the plain advisory marker.

### Named Rules

**The Spent Colour Rule.** Colour appears only where it changes a decision. If
removing a hue would not change what a reader does next, it should not be
there; ink and terrain carry everything else.

**The Subject Magenta Rule.** Series 0 is the subject (this run, this lap, the
line you actually flew) and takes procedure magenta; everything it is measured
against falls back to ink and the remaining series inks. Ordering ink first
inverts the world: a single-series run curve draws near-black and the only
magenta left on a measurement screen is a button.

**The No Brand Hue Rule.** DynoRun and Grip have no colour of their own. The
abolished amber-DynoRun and blue-Grip accents both competed with the data
plotted beside them. The two tools are told apart by their glyph and by the
title block. Do not reintroduce a brand hue.

**The Graphic Ink Rule.** `terrain`, `rule`, `rule-faint` and every `*-tint`
are graphic inks and never carry text. Text uses `ink`, `ink-2` or `ink-3`
only; those three clear 4.5:1 against the sheet on both plates, and terrain
does not (2.6:1).

**The Two Plates Rule.** Every colour is a `--color-*` custom property and
nothing resolves a literal hex, in CSS or in canvas code. The night plate
redefines the same fifteen properties in one block under
`:root[data-plate="night"]` and again under `prefers-color-scheme: dark`
guarded as `:root:not([data-plate="day"])`. A hex in chart code is exactly how
the night plate ends up with a day-plate grid.

**The Same Ink Both Halves Rule.** Canvas cannot read a custom property, so
charts resolve the plate's inks through `usePlateInk()`, which watches both the
`data-plate` attribute and the OS preference. A chart that watched only one
keeps drawing day ink on a night sheet.

## Typography

**Display Font:** Archivo variable (self-hosted, weight 100-900, width 62-125%),
falling back to `system-ui`.
**Body Font:** Archivo. Same face.
**Label/Mono Font:** Archivo. `--font-mono` is deliberately mapped to Archivo:
tabular figures are on globally, so there is no job left for a monospace face
and a mono costume for "technical" is refused.

**Character:** A single grotesque worked hard. Condensed and uppercase for
apparatus, normal width for prose, expanded and tight for the headline figures,
so a reader can tell a label from a measurement from a caption with the sheet
printed in one ink. Nothing here depends on a second typeface.

### Hierarchy

Ten registers, each a width plus a weight plus a case. Every string on a plate
sits in one of them.

- **Display** (`.t-display`, 800, width 108%, tracking -0.035em, line-height 0.94):
  the one statement line on a marketing surface. Balanced wrapping. Size is set
  by the surface, capped at 6rem.
- **Readout XL** (`.t-readout-xl`, 800, width 118%, clamp 3.5-6rem, line-height 0.84):
  the single headline measurement on a capture or review screen.
- **Readout** (`.t-readout`, 700, width 112%, clamp 2.25-4rem, line-height 0.86):
  a primary reading. It dwarfs its own label on purpose, because the number is
  what a rider reads at arm's length through a visor.
- **Readout SM** (`.t-readout-sm`, 600, width 100%, clamp 1.75-2.5rem, `ink-3`):
  a reading that could not be taken. Deliberately below Readout so an absent
  measurement and a present one can never be scanned as the same kind of thing.
- **Plate Title** (`.t-plate-title`, 800, width 87%, 17px, uppercase, tracking 0.02em):
  the `h1` in a title block. One per plate.
- **Label** (`.t-label`, 700, width 87%, 12px, uppercase, tracking 0.07em, `ink-2`):
  zone headings, channel names, row names, nav tabs.
- **Annotation** (`.t-annotation`, 600, width 75%, 11px, uppercase, tracking 0.09em, `ink-3`):
  the marginal register. Idents, units, scale statements, notes titles, table
  headers, provenance, hints, `n/a`.
- **Body** (`.t-body`, 400, width 100%, 15px, line-height 1.6, max-width 68ch):
  running prose. The measure is capped in the register itself, not per surface.
- **Data** (`.t-data`, 550, width 100%, tabular): any value read inline, in a
  row, a legend or a cross-reference readout.
- **Control** (`.ctl`, 700, width 87%, 13px, uppercase, tracking 0.07em): every
  button, tab and segmented cell. `ctl-major` promotes it to 18px at width 100%
  with 0.1em tracking for the trackside actions.

### Named Rules

**The One Family Rule.** Archivo is the only face in the product. A new
hierarchy level is a new combination of width, weight, case and rule, never a
second typeface and never a system display face.

**The Register Rule.** Type is applied by register class, not by ad-hoc
`font-size`. A surface that needs a size the registers do not have is a gap in
the system: add or adjust a register so every screen inherits it.

**The Tabular Rule.** Every numeral in this product is a measurement, so
`font-variant-numeric: tabular-nums` is set on `body` and reasserted on tables
and readouts. Figures never reflow as they tick.

**The n/a Rule.** A measurement that could not be taken prints `n/a` in the
annotation register (`.na`, condensed, `ink-3`), so it can never be scanned as
a value. Never a zero, never blank, and never a dash glyph. "No envelope" and
"an envelope of 0 g" are opposite facts.

**The No Dash Rule.** No en or em dashes anywhere: UI copy, labels, chart
titles, alt text. Use a comma, a colon, parentheses, or a second sentence.
Numeric ranges take a hyphen (`0-100 km/h`). The U+2212 minus in a signed delta
is a maths operator and stays.

## Layout

**The plate is the layout.** A screen is a `Plate` (a vertical stack) filled
with slots in reading order: `TitleBlock`, `PlanView`, `ProfileView`,
`MinimaTable`, `NotesBox`, `Advisory`, `RevisionBar`, `Zone`, `PlateRow`. A
screen omits slots it has no content for; it never invents a new one and never
wraps content in an unnamed container.

**Rhythm.** Plate sections are separated by 2.5rem, widening to 3.5rem at
768px, so the structure of a sheet is legible before a single value is read.
Inside a box the standard cell is 0.75rem horizontal by 0.5-0.625rem vertical;
table cells tighten to 0.625rem by 0.4-0.5rem. Sub-stacks within a zone run at
2.5rem. Column gaps are 2rem.

**Shell.** A fixed 14rem ruled tab column on the left at `lg` (1024px) and
above, with content offset 15.5rem; below that, a sticky ruled header and a
fixed bottom tab bar, both respecting `env(safe-area-inset-*)` through the
`pt-safe` / `pb-safe` helpers. Content is capped at 72rem and centred.

**Breakpoints** are Tailwind's defaults as used: 640px (title block meta grid
goes from 2 to 4 cells), 768px (plate stack widens), 1024px (rail appears,
review screens go two-column at `2fr 1fr`, landing plots switch rendition).

**Density is a function of the surface, not a global setting.** Review and
analyzer plates may be dense; capture plates are large-target and glanceable,
with 44px minimum control height and 76px for the trackside actions.

### Named Rules

**The Named Zone Rule.** `Zone` requires a `label`. No region of a plate goes
unnamed, so wayfinding is reading rather than guessing.

**The Layered Cascade Rule.** Base and component CSS live inside `@layer base`
and `@layer components`, and the `rule-t/-b/-l/-r/-section` dividers are
registered with `@utility`. Both are load-bearing, not tidiness: an unlayered
rule beats every Tailwind utility regardless of specificity (which once
rendered the shell's active tab ink on ink), and a divider written as a plain
class silently compiles no responsive variant, so `sm:rule-l` just fails to
appear. Do not unwrap these blocks.

**The Two Renditions Rule.** The prerendered landing plots ship at two viewBox
widths and CSS picks the one whose column it was drawn for. SVG text is
measured in viewBox units, so one frame cannot serve a 326px phone column and a
700px desktop column, and the landing page is hook-free by contract (zero
scripts, so no ResizeObserver).

## Elevation & Depth

**There is no elevation.** No `box-shadow` anywhere in the system, no radius, no
blur, no glass, no gradient. Depth is rule weight and one recessed tone, exactly
as on a printed chart:

- **Hairline** (1px `rule`): separates cells, rows and boxes. The default.
- **Frame** (1.5px `ink`): the boundary of a plate, a framed zone, a plan view,
  a control. It says "this is one object".
- **Section** (2px `ink`, top only): cuts the sheet into major blocks, and rules
  off the revision bar.
- **Sunk** (`sunk` fill): the only recessed surface. Notes boxes, hover states,
  disabled fields.

The one `box-shadow` in the stylesheet is `inset 0 0 0 1px` on a focused field,
which thickens the border in place rather than casting anything.

### Named Rules

**The No-Card Rule.** A frame is the plate's only container. Anything that needs
separating gets a rule, not a card, and never a nested one. Same-size cards of
icon plus heading plus text are not available as a page structure.

**The Flat State Rule.** State changes tone or rule, never depth. The active
state everywhere in the product inverts to solid ink, so it survives sunlight,
gloves and a colour-blind reader; nothing about it depends on hue.

## Shapes

**Radius is zero, everywhere, with no exceptions.** Buttons, fields, tables,
boxes, swatches, gauge tracks and the uPlot cursor point are all square. Where a
third-party surface ships a radius, it is forced back to 0.

Form language is rectangular and orthogonal. Swatches are 22x2.5px line
segments (matching the stroke a chart draws) or 10px squares, never dots or
pills. Gauges are 10px ruled tracks with a solid fill and a `scaleX` transform,
18px in the major size; never a pill and never a progress ring. Icons are
authored SVG on a 24px grid at 1.6px stroke with `stroke-linecap: square`, one
consistent weight across the product, and the single chevron primitive lives in
the plate package so three screens cannot draw three of them.

Brand marks are drawn in the plate's own symbology, single-ink, no gradient, no
radius: `SuiteMark` is a registration cross (the mark a printed sheet carries to
prove it is aligned), `BrandLogo` is the profile trace DynoRun draws, `GripMark`
is the traction circle Grip draws.

### Named Rules

**The Hatch Rule.** Missing, masked or unmeasured data is hatched at 45 degrees,
4px transparent to 1px `rule` (amber for a cautionary region), never left blank
and never filled with zero. The DOM half (`.hatch`) and the canvas half
(`hatchPattern`) must stay at the same angle and pitch or a masked canvas region
stops matching its own legend swatch.

**The Empty Table Rule.** A table with no rows renders a hatched block carrying
a sentence, not an illustration and not whitespace.

## Components

### Buttons

- **Shape:** square (0 radius), 1.5px ink frame, 44px minimum height, 0.625rem
  by 1rem padding, uppercase control register, 120ms colour transition on the
  plate easing.
- **Outline (default):** sheet ground, ink text and frame. Hover fills `sunk`.
- **Solid:** inverted to ink ground with sheet text. This is also the state
  every `aria-pressed="true"` / `data-active="true"` control takes, so a tab, a
  toggle and a selected segment all say "on" the same way. Hover softens to
  `ink-2`.
- **Procedure:** magenta ground, white text. Reserved for the one action that is
  yours: recording, arming, committing. Hover inverts to solid ink.
- **Disabled:** `rule` frame, `ink-3` text, `sunk` ground, `not-allowed`.
- **Major:** full width, 76px tall, 18px at width 100% and 0.1em tracking. For
  the trackside actions a rider hits without looking.
- **Focus:** the global 2px `procedure` outline at 2px offset. Never removed.

### Segmented Control

One 1.5px ink frame containing borderless cells divided by hairlines; the
selected cell inverts to solid ink. `role="radiogroup"` with `aria-checked`.
This replaces every ad-hoc tab row and toggle group, so a lap selector and a
units switch read as the same instrument control.

### Inputs / Fields

- **Style:** full-width, hairline `rule` border, sheet ground, 0.625rem by
  0.75rem padding, 44px minimum height, tabular figures, 16px minimum font size
  so iOS Safari does not zoom on focus.
- **Focus:** border goes to ink and an `inset 0 0 0 1px` ink shadow thickens it
  in place. No glow, no colour change.
- **Disabled:** `sunk` ground, `ink-3` text.
- **Label:** always present, always in the annotation register, above the
  control. A placeholder-only field loses its name the moment it is filled.
  Errors print in `caution` below the field and replace the hint.

### Cards / Containers

There are no cards. The container vocabulary is:

- **`box`:** hairline `rule` border on sheet. The default grouping.
- **`box-frame`:** 1.5px ink border on sheet. A plate, a framed zone, a plan
  view, a title block.
- **`plate-sunk`:** the `sunk` fill, used by the notes box.
- **Internal padding:** 0.75rem horizontal, 0.5-0.625rem vertical.
- **Shadow:** none. See Elevation & Depth.

### Tables (Minima Table)

The boxed decision table is one component for corner tables, run lists,
calibration candidates and lap pickers, so a reader learns one table and can
read every screen. Header cells are the annotation register over a 1.5px ink
underline; body rows are separated by `rule-faint` hairlines. Numeric columns
right-align and force tabular figures. Hover fills `sunk`; a selected row washes
`procedure-tint`. No zebra fills, no rounded corners, no per-row cards. Empty
state is a hatched block.

### Navigation

A chart binder's index: a ruled column of tabs at `lg` and above, a ruled bottom
bar below it. Tabs are an icon plus a label in the label register (10px
condensed uppercase in the bottom bar), with no pills, no radii and no hover
wash beyond `sunk`. The current tab inverts to solid ink, the same state
language every control uses. The rail is bounded by a right-hand hairline; the
bottom bar by a top hairline plus the safe-area inset.

### Readout

The primary reading, and deliberately not a stat card: no box of its own, no
icon, no shadow, no equal-sized siblings filling a grid. An annotation label
sits above; the figure below in the readout register with its unit set at
0.28em in the annotation style; an optional provenance note beneath. Readouts
live inside a `Zone` or a minima row, where the rules already say what they
belong to. Its counterpart `NoReading` prints `n/a` at reduced size with the
reason spelled out.

### Advisory

A hairline-framed box in `caution` on `caution-tint`, with a 14px solid square
marker (not a glyph) and body copy in ink. `role="status"` with a polite live
region by default; `urgent` promotes it to `role="alert"` and assertive, and is
reserved for an advisory whose next tap writes a wrong number. On the hands-free
screens an advisory is a persistent banner, never a toast, because the phone is
in a pocket when it fires.

### Gauge

A bounded reading against its limit (GPS lock, a stability window, a hold
countdown): a 10px ruled track with a solid ink fill, 18px in the major size.
Ink so it reads at a glance in sunlight; `procedure` only once the threshold is
reached; `caution` frame and fill when the reading is *blocked*, which is not
the same as "not yet full" and obliges the caller to say so in words beside it.

### Charts

Both plot grammars (hand-drawn SVG on the prerendered landing page, uPlot in the
app) obey one axis convention, because two renditions of the same instrument
cannot draw their furniture two different ways: bare integer ticks with no
grouped thousands, round tick steps only, the unit stated in the plot's corner
rather than on every tick, a 1.5px ink spine with no tick dashes, `rule-faint`
gridlines, and 10px condensed labels. Series identity is a colour *and* a dash
pattern together, never hue alone. uPlot's own chrome is reclaimed: its legend
is restyled into the plate's annotation-plus-data registers with the same
`ChannelStrip` swatch (a 16px 2.5px-thick rule, never a bordered box), its
cursor is magenta at 1.5px, its idle cursor point is hidden, and its selection
region is a `procedure-tint` fill with no border. The power curve replaces the
legend entirely with the shared cross-reference readout.

### Cross-Reference (signature)

The signature interaction. On an approach plate the plan view and the profile
view are two views of one procedure, so a cursor anywhere (track map, power
curve, load timeline, delta chart) publishes one position and every other view
in the plate reports the same instant, joined by a hairline leader. One
primitive scoped per plate, used identically by DynoRun and Grip, instead of
each chart owning a private hover state nothing else can read.

### Browser Surfaces

The parts the product did not draw still belong to the plate: text selection is
magenta on sheet, the caret and accent colour are magenta, the focus ring is a
2px magenta outline at 2px offset, scrollbars are a thin `rule` thumb inset from
the sheet, link underlines are `terrain` at 1px with a 3px offset, placeholders
are `ink-3` at full opacity, and `overscroll-behavior-y` is off because a
printed sheet does not bounce.

### Motion

One authored moment: `plate-issue`, a 420ms settle on mount from an
already-visible 0.55 opacity and 6px offset, on `cubic-bezier(0.16, 1, 0.3, 1)`.
Everything else is functional and short: 120ms on control colour, 160ms linear
on a gauge fill. A `prefers-reduced-motion` block neutralises all of it.

## Do's and Don'ts

### Do:

- **Do** compose every screen from the plate slots (`TitleBlock`, `PlanView`,
  `ProfileView`, `MinimaTable`, `NotesBox`, `Advisory`, `RevisionBar`, `Zone`,
  `PlateRow`). If a screen needs something the system lacks, add it to
  `src/ui/plate/` so all surfaces get it.
- **Do** resolve every colour through a `--color-*` custom property, and in
  canvas through `usePlateInk()`, so both plates switch together.
- **Do** give every overlaid series a colour **and** a dash (`seriesInk` +
  `SERIES_DASH`), with series 0 as the subject in procedure magenta.
- **Do** print `n/a` in the annotation register for anything unmeasured, and
  hatch any masked or unmeasured region.
- **Do** state what a measurement is worth on the sheet, in a `NotesBox`, next
  to the number it qualifies.
- **Do** keep every control at 44px minimum height, and use `ctl-major` (76px,
  full width) for anything a rider touches at the track.
- **Do** author new CSS inside `@layer base` / `@layer components`, and any new
  divider with `@utility`.
- **Do** write axis ticks as bare round integers with the unit stated once in
  the plot corner.

### Don't:

- **Don't** add a card, a radius, a shadow, a gradient, a glass blur, or a
  tonal elevation. A frame and a rule are the only containers.
- **Don't** reintroduce a per-tool brand colour, or spend a hue anywhere it does
  not change a decision.
- **Don't** use `terrain`, `rule`, `rule-faint` or any `*-tint` for text.
- **Don't** signal state by hue alone: the active state inverts to solid ink.
- **Don't** hardcode a hex in CSS or in chart code.
- **Don't** introduce a second typeface, a system display face, or monospace as
  a costume for "technical".
- **Don't** set an ad-hoc `font-size` in place of a type register.
- **Don't** place a small uppercase line above a heading as decoration. The
  title block's `ident` is the subject of the sheet (vehicle, session, track),
  which is data; a kicker or eyebrow is not available in this world, and the
  landing page's thesis section is deliberately titled by its own heading for
  exactly this reason.
- **Don't** print a zero, a blank, or a dash glyph for a value that could not be
  measured, and don't use an en or em dash anywhere in the repo.
- **Don't** stand a progress ring, a sparkline or a soft rounded rectangle in
  for content, and don't use a Unicode glyph or emoji in place of a drawn icon.
- **Don't** surface a trackside advisory as a toast; it must still be on screen
  when the rider pulls the phone out of a pocket.
