import type { CSSProperties, ReactNode } from 'react';
import { analyzeRun } from '@/analysis/pipeline';
import { PIPELINE_VERSION, type RawSpeedSample } from '@/analysis/types';
import { SuiteMark, Wordmark } from '@/ui/components/brand-wordmark';
import {
  Advisory,
  MinimaTable,
  PlanView,
  PlateAnchor,
  ProfileView,
  Readout,
  RevisionBar,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';

/**
 * The public landing page: a specimen sheet, not a document.
 *
 * Everything plotted below is computed at module scope by the shipping analysis
 * pipeline (`analyzeRun`) and by the same traction-envelope construction the
 * Grip analyzer uses, from synthetic input the page names as synthetic. No
 * screenshots: a picture of the app goes stale the moment the app changes, and
 * a sheet that draws its own data is the argument.
 *
 * Two hard constraints on this file, both load-bearing:
 *
 *  1. It must stay hook-free and `<Link>`-free. It is rendered by the SPA and by
 *     `renderToStaticMarkup` in a script-free prerender that runs no effects and
 *     boots no Router, so every route is a plain anchor (`PlateAnchor`, never
 *     `PlateLink`) and every figure is computed before render, never in state.
 *  2. No internal link may point at "/". That URL only 301s here, and linking it
 *     spends crawl budget re-asking Google about the abandoned root. Home is
 *     /hello. `tests/prerender/landing-document.test.tsx` pins both.
 *
 * The composition rule that keeps this from reading as documentation again:
 * statements sit on the bare sheet with air and monumental type, evidence sits
 * on planes, and exactly one block takes the accent plane. The hero is that
 * block, and it holds the photograph so the opening reads as one object rather
 * than as two competing accents.
 */

/* ------------------------------------------------------------------ dyno --- */

const DEMO_MASS_KG = 1420;
/** Tyre circumference x gear ratio x final drive, the one number a calibration captures. */
const DEMO_ROLLOUT_M_PER_REV = 0.49;
const DEMO_GEAR = '4th gear';
const RPM_START = 2000;
const RPM_CUT = 6900;

/**
 * Wheel torque against the calibrated RPM axis. A mid-range peak with a soft
 * top end, which is what makes the derived curve worth plotting: a constant
 * acceleration would come back as a straight ramp and prove nothing.
 */
function wheelTorqueNm(rpm: number): number {
  const x = (rpm - 4300) / 2600;
  const shape = 1 - 0.44 * x * x - 0.045 * Math.cos((rpm - 2100) / 470);
  return Math.max(80, 392 * shape);
}

/**
 * A 10 Hz speed trace, the shape a GPS receiver would hand the app. Aero drag
 * and rolling resistance are in the simulation but not in the pipeline, which
 * is exactly why the derived curve reads lower than the torque that produced
 * it: what comes out is net wheel power, the honest quantity.
 */
function synthesizePull(): RawSpeedSample[] {
  const STEP_S = 0.1;
  const samples: RawSpeedSample[] = [];
  let v = (RPM_START * DEMO_ROLLOUT_M_PER_REV) / 60;
  let t = 0;
  for (let i = 0; i < 320; i += 1) {
    samples.push({ t_ms: t, speed_mps: v });
    const rpm = (v / DEMO_ROLLOUT_M_PER_REV) * 60;
    const drag = 0.5 * 1.2 * 0.62 * v * v + 0.014 * DEMO_MASS_KG * 9.81;
    const drive = rpm >= RPM_CUT ? 0 : (wheelTorqueNm(rpm) * ((2 * Math.PI * rpm) / 60)) / v;
    v = Math.max(1, v + ((drive - drag) / DEMO_MASS_KG) * STEP_S);
    t += 100;
    if (rpm >= RPM_CUT && samples.length > 40) break;
  }
  // A short coast, so the pipeline's accel-phase trim has something to trim.
  for (let i = 0; i < 20; i += 1) {
    v -= 0.35;
    samples.push({ t_ms: t, speed_mps: Math.max(1, v) });
    t += 100;
  }
  return samples;
}

const DYNO = analyzeRun({
  samples: synthesizePull(),
  mass_kg: DEMO_MASS_KG,
  rollout_m_per_rev: DEMO_ROLLOUT_M_PER_REV,
});

const DYNO_POINTS = DYNO.points;
const PEAK_POWER = DYNO_POINTS.reduce(
  (best, p) => (p.wheel_power_kw > best.wheel_power_kw ? p : best),
  DYNO_POINTS[0],
);
const PEAK_TORQUE = DYNO_POINTS.reduce(
  (best, p) => (p.wheel_torque_nm > best.wheel_torque_nm ? p : best),
  DYNO_POINTS[0],
);

/* ------------------------------------------------------------------ grip --- */

/** Deterministic, so the prerendered sheet and the SPA draw the same session. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface GripSample {
  lat: number;
  along: number;
  turn: number;
}

interface DemoTurn {
  turn: number;
  brake: number;
  apex: number;
  drive: number;
}

const TURN_SHAPES: DemoTurn[] = [
  { turn: 1, brake: 1.14, apex: 1.02, drive: 0.71 },
  { turn: 2, brake: 0.62, apex: 1.26, drive: 0.83 },
  { turn: 3, brake: 1.05, apex: 1.18, drive: 0.66 },
  { turn: 4, brake: 0.84, apex: 1.31, drive: 0.79 },
  { turn: 5, brake: 1.19, apex: 0.94, drive: 0.61 },
  { turn: 6, brake: 0.71, apex: 1.22, drive: 0.86 },
  { turn: 7, brake: 0.98, apex: 1.09, drive: 0.74 },
];

/**
 * A track session as the analyzer sees it: lateral demand from lean, and
 * longitudinal demand from the drag-corrected speed derivative, so a true coast
 * sits at zero rather than at the drag it is actually feeling.
 */
function synthesizeSession(): GripSample[] {
  const rand = lcg(0x5eed_1a2b);
  const out: GripSample[] = [];
  for (let lap = 0; lap < 4; lap += 1) {
    // Later laps are marginally quicker, the way a real stint warms up.
    const pace = 0.93 + lap * 0.025;
    for (const shape of TURN_SHAPES) {
      for (let i = 0; i < 11; i += 1) {
        const p = (i + 0.5) / 11;
        const scatter = 0.94 + rand() * 0.1;
        const lat = shape.apex * Math.sin(Math.PI * p) * pace * scatter;
        const phase = -Math.cos(Math.PI * p);
        const along = (p < 0.5 ? shape.brake : shape.drive) * phase * pace * scatter;
        out.push({ lat: rand() > 0.5 ? lat : -lat, along, turn: shape.turn });
      }
    }
  }
  return out;
}

const GRIP_SAMPLES = synthesizeSession();

const ENVELOPE_BINS = 24;

/**
 * The traction envelope: the largest demand actually reached in each angular
 * bin. Descriptive only, and never a divisor. A percentage of a rider's own
 * best guarantees readings over 100% and hides a slow day, which is why every
 * headline figure on this sheet is an absolute score instead.
 */
function buildEnvelope(samples: GripSample[]): number[] {
  const bins = new Array<number>(ENVELOPE_BINS).fill(0);
  for (const s of samples) {
    const r = Math.hypot(s.lat, s.along);
    let a = Math.atan2(s.along, s.lat) / (2 * Math.PI);
    if (a < 0) a += 1;
    const bin = Math.min(ENVELOPE_BINS - 1, Math.floor(a * ENVELOPE_BINS));
    if (r > bins[bin]) bins[bin] = r;
  }
  // Max-preserving smoothing: a boundary may be pulled out by a neighbour, never in.
  return bins.map((v, i) => {
    const prev = bins[(i - 1 + ENVELOPE_BINS) % ENVELOPE_BINS];
    const next = bins[(i + 1) % ENVELOPE_BINS];
    return Math.max(v, (prev + next) / 2);
  });
}

const ENVELOPE = buildEnvelope(GRIP_SAMPLES);
/** Session score: 100 x the RMS envelope radius. 100 is one g all the way round. */
const SESSION_SCORE = Math.round(
  100 * Math.sqrt(ENVELOPE.reduce((sum, r) => sum + r * r, 0) / ENVELOPE.length),
);
const PEAK_COMBINED = Math.max(...GRIP_SAMPLES.map((s) => Math.hypot(s.lat, s.along)));

interface TurnReading {
  turn: number;
  brake: number;
  apex: number;
  drive: number;
  score: number;
}

const TURN_READINGS: TurnReading[] = TURN_SHAPES.map((shape) => {
  const mine = GRIP_SAMPLES.filter((s) => s.turn === shape.turn);
  return {
    turn: shape.turn,
    brake: Math.max(...mine.map((s) => -Math.min(0, s.along))),
    apex: Math.max(...mine.map((s) => Math.abs(s.lat))),
    drive: Math.max(...mine.map((s) => Math.max(0, s.along))),
    // The largest demand actually reached at once, not the peaks of three
    // separate channels added up: those never happen in the same instant, and
    // combining them would print a score above the session's own peak.
    score: Math.round(100 * Math.max(...mine.map((s) => Math.hypot(s.lat, s.along)))),
  };
});

/* ----------------------------------------------------------------- plots --- */

/**
 * Plot ink, resolved through the plate's custom properties.
 *
 * These used to be Tailwind colour utilities (`stroke-procedure`,
 * `stroke-rule-faint`, `fill-terrain`), and every one of them named a token the
 * Grid Specimen rebuild deleted. Tailwind emits no class for a colour that is
 * not in `@theme`, so the whole graticule silently fell back to the SVG default
 * of solid black, on both plates. Naming the properties directly means a token
 * that disappears is a visible break, not a black chart.
 */
const PLOT_GRID = 'var(--color-grid-strong)';
const PLOT_AXIS = 'var(--color-ink)';
const PLOT_LABEL = 'var(--color-ink-3)';
const PLOT_CURVE = 'var(--color-ink)';

/**
 * Two renditions of every plot, one per column width, chosen by CSS.
 *
 * Text inside an SVG is measured in viewBox units, so it scales with the frame.
 * A single 680-unit plot squeezed into a phone's ~326 px column renders its
 * tick labels near 5 CSS px, and sizing them for the phone makes the desktop
 * axis shout: one viewBox cannot serve both, and a constant multiplier only
 * moves the problem. These screens are hook-free by contract (the landing page
 * is prerendered without a single script, so there is no ResizeObserver to
 * reach for), which leaves the honest answer: draw the plot at the width it
 * will actually be read at. Same functions, same data, two frames.
 */
type PlotWidth = 'wide' | 'narrow';
const PLAN_W_BY: Record<PlotWidth, number> = { wide: 1040, narrow: 340 };
/** The column each rendition is read in, so ts() lands on a real CSS size. */
const COLUMN_PX_BY: Record<PlotWidth, number> = { wide: 1088, narrow: 326 };
const ts = (cssPx: number, w: PlotWidth) => (cssPx * PLAN_W_BY[w]) / COLUMN_PX_BY[w];
const PLAN_H_BY: Record<PlotWidth, number> = { wide: 380, narrow: 300 };
const PROFILE_H_BY: Record<PlotWidth, number> = { wide: 150, narrow: 150 };
const PAD_L = 52;
const PAD_R = 14;
const PAD_T = 22;
const PAD_B = 30;

const RPM_MIN = 2000;
const RPM_MAX = 7000;
const POWER_MAX = Math.ceil(PEAK_POWER.wheel_power_kw / 50) * 50;
const TORQUE_MAX = Math.ceil(PEAK_TORQUE.wheel_torque_nm / 100) * 100;
const RPM_TICKS = [2000, 3000, 4000, 5000, 6000, 7000];
/** Round steps only: a 187.5 kW gridline is a tell that nobody chose the axis. */
const POWER_TICKS = Array.from({ length: POWER_MAX / 50 + 1 }, (_, i) => i * 50);

function xAt(rpm: number, pw: number): number {
  return PAD_L + ((rpm - RPM_MIN) / (RPM_MAX - RPM_MIN)) * (pw - PAD_L - PAD_R);
}

function yAt(value: number, max: number, height: number): number {
  return height - PAD_B - (value / max) * (height - PAD_T - PAD_B);
}

function polyline(
  read: (p: (typeof DYNO_POINTS)[number]) => number,
  max: number,
  height: number,
  pw: number,
): string {
  return DYNO_POINTS.map(
    (p) => `${xAt(p.rpm, pw).toFixed(1)},${yAt(read(p), max, height).toFixed(1)}`,
  ).join(' ');
}

/** The plan view: the field the procedure is flown across. */
function PowerPlot({ w }: { w: PlotWidth }) {
  const PW = PLAN_W_BY[w];
  const PH = PLAN_H_BY[w];
  const tp = (cssPx: number) => ts(cssPx, w);
  const peakX = xAt(PEAK_POWER.rpm, PW);
  const peakY = yAt(PEAK_POWER.wheel_power_kw, POWER_MAX, PH);
  return (
    <svg
      viewBox={`0 0 ${PW} ${PH}`}
      role="img"
      aria-label={`Wheel power against engine RPM, peaking at ${PEAK_POWER.wheel_power_kw.toFixed(0)} kilowatts near ${PEAK_POWER.rpm.toFixed(0)} RPM`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {POWER_TICKS.map((t) => (
        <g key={t}>
          <line
            x1={PAD_L}
            x2={PW - PAD_R}
            y1={yAt(t, POWER_MAX, PH)}
            y2={yAt(t, POWER_MAX, PH)}
            stroke={PLOT_GRID}
            strokeWidth="1"
          />
          <text
            x={PAD_L - 8}
            y={yAt(t, POWER_MAX, PH) + 3.5}
            textAnchor="end"
            fill={PLOT_LABEL}
            style={{ fontSize: tp(10), fontStretch: '75%', fontWeight: 600 }}
          >
            {t}
          </text>
        </g>
      ))}
      {RPM_TICKS.map((r) => (
        <g key={r}>
          <line
            x1={xAt(r, PW)}
            x2={xAt(r, PW)}
            y1={PAD_T}
            y2={PH - PAD_B}
            stroke={PLOT_GRID}
            strokeWidth="1"
          />
          <text
            x={xAt(r, PW)}
            y={PH - PAD_B + 15}
            textAnchor="middle"
            fill={PLOT_LABEL}
            style={{ fontSize: tp(10), fontStretch: '75%', fontWeight: 600 }}
          >
            {r}
          </text>
        </g>
      ))}
      <line
        x1={PAD_L}
        x2={PW - PAD_R}
        y1={PH - PAD_B}
        y2={PH - PAD_B}
        stroke={PLOT_AXIS}
        strokeWidth="1.5"
      />
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PH - PAD_B} stroke={PLOT_AXIS} strokeWidth="1.5" />
      <polyline
        points={polyline((p) => p.wheel_power_kw, POWER_MAX, PH, PW)}
        fill="none"
        stroke={PLOT_CURVE}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <g>
        <line
          x1={peakX}
          x2={peakX}
          y1={peakY}
          y2={PH - PAD_B}
          stroke={PLOT_CURVE}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle cx={peakX} cy={peakY} r="3.5" fill={PLOT_CURVE} />
        <text
          x={peakX - 10}
          y={peakY - 9}
          textAnchor="end"
          fill={PLOT_AXIS}
          style={{
            fontSize: tp(12.5),
            fontStretch: '87%',
            fontWeight: 700,
            paintOrder: 'stroke',
            stroke: 'var(--color-plane)',
            strokeWidth: 4,
            strokeLinejoin: 'round',
          }}
        >
          {PEAK_POWER.wheel_power_kw.toFixed(0)} kW at {PEAK_POWER.rpm.toFixed(0)} RPM
        </text>
      </g>
      <text
        x={PAD_L}
        y={11}
        fill={PLOT_LABEL}
        style={{ fontSize: tp(9.5), fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        KW
      </text>
      <text
        x={PW - PAD_R}
        y={11}
        textAnchor="end"
        fill={PLOT_LABEL}
        style={{ fontSize: tp(9.5), fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        RPM
      </text>
    </svg>
  );
}

/** The profile view: the same axis, one level down. */
function TorquePlot({ w }: { w: PlotWidth }) {
  const PW = PLAN_W_BY[w];
  const PH = PROFILE_H_BY[w];
  const tp = (cssPx: number) => ts(cssPx, w);
  return (
    <svg
      viewBox={`0 0 ${PW} ${PH}`}
      role="img"
      aria-label={`Wheel torque against the same RPM axis, peaking at ${PEAK_TORQUE.wheel_torque_nm.toFixed(0)} newton metres`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {[0, TORQUE_MAX / 2, TORQUE_MAX].map((t) => (
        <g key={t}>
          <line
            x1={PAD_L}
            x2={PW - PAD_R}
            y1={yAt(t, TORQUE_MAX, PH)}
            y2={yAt(t, TORQUE_MAX, PH)}
            stroke={PLOT_GRID}
            strokeWidth="1"
          />
          <text
            x={PAD_L - 8}
            y={yAt(t, TORQUE_MAX, PH) + 3.5}
            textAnchor="end"
            fill={PLOT_LABEL}
            style={{ fontSize: tp(10), fontStretch: '75%', fontWeight: 600 }}
          >
            {t}
          </text>
        </g>
      ))}
      {RPM_TICKS.map((r) => (
        <line
          key={r}
          x1={xAt(r, PW)}
          x2={xAt(r, PW)}
          y1={PAD_T}
          y2={PH - PAD_B}
          stroke={PLOT_GRID}
          strokeWidth="1"
        />
      ))}
      <line
        x1={PAD_L}
        x2={PW - PAD_R}
        y1={PH - PAD_B}
        y2={PH - PAD_B}
        stroke={PLOT_AXIS}
        strokeWidth="1.5"
      />
      <polyline
        points={polyline((p) => p.wheel_torque_nm, TORQUE_MAX, PH, PW)}
        fill="none"
        stroke={PLOT_CURVE}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeDasharray="7 4"
      />
      <text
        x={PAD_L}
        y={11}
        fill={PLOT_LABEL}
        style={{ fontSize: tp(9.5), fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        NM
      </text>
      {RPM_TICKS.map((r) => (
        <text
          key={r}
          x={xAt(r, PW)}
          y={PH - PAD_B + 15}
          textAnchor="middle"
          fill={PLOT_LABEL}
          style={{ fontSize: tp(10), fontStretch: '75%', fontWeight: 600 }}
        >
          {r}
        </text>
      ))}
    </svg>
  );
}

const CIRCLE_SIZE = 340;
/**
 * The circle is drawn in its own square viewBox, so it cannot borrow the power
 * plot's scale: sharing `ts()` sized its `0.5 G` rings at about 4 CSS px, which
 * is a legend nobody can read. Same idea, its own column widths.
 */
const CIRCLE_COLUMN_PX: Record<PlotWidth, number> = { wide: 470, narrow: 334 };
const cts = (cssPx: number, w: PlotWidth) => (cssPx * CIRCLE_SIZE) / CIRCLE_COLUMN_PX[w];
const CIRCLE_C = CIRCLE_SIZE / 2;
const CIRCLE_G = 1.5;
const CIRCLE_R = CIRCLE_C - 26;

function gx(lat: number): number {
  return CIRCLE_C + (lat / CIRCLE_G) * CIRCLE_R;
}

function gy(along: number): number {
  return CIRCLE_C - (along / CIRCLE_G) * CIRCLE_R;
}

/** The traction circle, drawn the way the analyzer draws it. */
function TractionCircle({ w }: { w: PlotWidth }) {
  const tp = (cssPx: number) => cts(cssPx, w);
  const envelopePoints = ENVELOPE.map((r, i) => {
    const a = ((i + 0.5) / ENVELOPE_BINS) * 2 * Math.PI;
    return `${gx(r * Math.cos(a)).toFixed(1)},${gy(r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

  return (
    <svg
      viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}
      role="img"
      aria-label={`Traction circle: lateral against longitudinal g demand, peaking at ${PEAK_COMBINED.toFixed(2)} g combined`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {[0.5, 1.0, 1.5].map((g) => (
        <circle
          key={g}
          cx={CIRCLE_C}
          cy={CIRCLE_C}
          r={(g / CIRCLE_G) * CIRCLE_R}
          fill="none"
          stroke={PLOT_GRID}
          strokeWidth="1"
        />
      ))}
      <line
        x1={CIRCLE_C - CIRCLE_R}
        x2={CIRCLE_C + CIRCLE_R}
        y1={CIRCLE_C}
        y2={CIRCLE_C}
        stroke={PLOT_GRID}
        strokeWidth="1"
      />
      <line
        x1={CIRCLE_C}
        x2={CIRCLE_C}
        y1={CIRCLE_C - CIRCLE_R}
        y2={CIRCLE_C + CIRCLE_R}
        stroke={PLOT_GRID}
        strokeWidth="1"
      />
      {/* One fill for the whole scatter: 300-odd per-circle attributes is real
          weight in a document that inlines everything it ships. */}
      <g fill={PLOT_LABEL} opacity="0.5">
        {GRIP_SAMPLES.map((s, i) => (
          <circle key={i} cx={gx(s.lat).toFixed(1)} cy={gy(s.along).toFixed(1)} r="2" />
        ))}
      </g>
      <polygon
        points={envelopePoints}
        fill="none"
        stroke={PLOT_CURVE}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* The scale rides on top of the data, with a knocked-out backing in the
          plane's own colour. Drawn under the envelope, the `1.5 G` ring label
          lost its leading digit to the boundary stroke on a phone: the standard
          cartographic answer is paint-order, not moving the label somewhere the
          data happens to be thin today. */}
      <g
        fill={PLOT_LABEL}
        style={{
          paintOrder: 'stroke',
          stroke: 'var(--color-plane)',
          strokeWidth: 3.5,
          strokeLinejoin: 'round',
          fontSize: tp(9.5),
          fontStretch: '75%',
          fontWeight: 700,
          letterSpacing: '0.09em',
        }}
      >
        {[0.5, 1.0, 1.5].map((g) => (
          <text
            key={g}
            x={CIRCLE_C + (g / CIRCLE_G) * CIRCLE_R - 4}
            y={CIRCLE_C - 5}
            textAnchor="end"
          >
            {g.toFixed(1)} G
          </text>
        ))}
        <text x={CIRCLE_C} y={13} textAnchor="middle">
          DRIVE
        </text>
        <text x={CIRCLE_C} y={CIRCLE_SIZE - 4} textAnchor="middle">
          BRAKE
        </text>
      </g>
    </svg>
  );
}

const TURN_COLUMNS: MinimaColumn<TurnReading>[] = [
  { key: 'turn', head: 'Turn', cell: (r) => `T${r.turn}` },
  { key: 'brake', head: 'Brake g', numeric: true, cell: (r) => r.brake.toFixed(2) },
  { key: 'apex', head: 'Apex lat g', numeric: true, cell: (r) => r.apex.toFixed(2) },
  { key: 'drive', head: 'Drive g', numeric: true, cell: (r) => r.drive.toFixed(2) },
  { key: 'score', head: 'Score', numeric: true, cell: (r) => String(r.score) },
];

/* ---------------------------------------------------------- ink surfaces --- */

/**
 * Everything drawn on the accent plane has to be mixed from `--color-sheet`,
 * never from a literal white. On the night plate `.plane-ink` inverts: its
 * ground becomes `--color-ink` (light) and its foreground `--color-sheet`
 * (dark), so a hardcoded white rule would vanish on exactly one of the two
 * plates and nobody would see it in the other.
 */
const onInk = (pct: number) => `color-mix(in srgb, var(--color-sheet) ${pct}%, transparent)`;

/* ---------------------------------------------------------------- screen --- */

const SPEC_CELLS = [
  { label: 'GPS analysis', value: 'Power and torque curves from acceleration data.' },
  { label: 'RaceBox support', value: 'Import an exported session CSV in your browser.' },
  { label: 'Browser access', value: 'Review, compare and share without desktop software.' },
  { label: 'Hardware', value: 'A phone. No rollers, no dongle, no drum.' },
];

const HERO_FIGURES = [
  {
    label: 'Peak wheel power',
    value: PEAK_POWER.wheel_power_kw.toFixed(0),
    unit: 'kW',
    note: `At ${PEAK_POWER.rpm.toFixed(0)} RPM, ${DEMO_GEAR}`,
  },
  {
    label: 'Peak wheel torque',
    value: PEAK_TORQUE.wheel_torque_nm.toFixed(0),
    unit: 'Nm',
    note: 'Averaged in 100 RPM bins',
  },
  {
    label: 'Session grip score',
    value: String(SESSION_SCORE),
    unit: null,
    note: '100 is one g all the way round',
  },
  {
    label: 'Peak combined demand',
    value: PEAK_COMBINED.toFixed(2),
    unit: 'g',
    note: 'Largest vector of the session',
  },
];

const DYNO_TERMS = [
  {
    term: 'Calibration',
    def: 'One steady hold at a known RPM captures rollout in metres per rev: tyre, gearbox and final drive in a single number.',
  },
  {
    term: 'Capture',
    def: 'Drivers watch the screen and confirm. Riders pocket the phone, ride, and pick the pulls once they have stopped.',
  },
  {
    term: 'Output',
    def: 'Wheel power and torque in 100 RPM bins, plus accel times and the raw trace behind them.',
  },
];

const GRIP_TERMS = [
  {
    term: 'Envelope',
    def: 'The traction boundary you actually reached, per angular bin, from your timed laps only. It describes what you did; it is never used as a divisor.',
  },
  {
    term: 'Turns',
    def: 'Apexes are matched to a track turn across every lap, so T4 means the same bend on lap 1 and on lap 9.',
  },
  {
    term: 'Compare',
    def: 'Up to six laps on one spatial axis, with the stretch outside their common section hatched rather than guessed.',
  },
];

const PROCEDURE_STEPS = [
  {
    step: '01',
    name: 'Record',
    body: 'Capture a clean GPS pull, or import a RaceBox session. Riders record the whole ride and choose afterwards, because nothing worth choosing happens while the vehicle is moving.',
  },
  {
    step: '02',
    name: 'Compare',
    body: 'Put runs on one RPM axis and laps on one spatial axis. A cleaner curve tells you more than a peak number, and a lap delta says where the time went.',
  },
  {
    step: '03',
    name: 'Decide',
    body: 'Keep the change that improved the data. Revisit the one that did not. The comparison is the product; the number on its own is not.',
  },
];

/** The page's one measure: every band lines up on the same column. */
function Band({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 lg:px-8 ${className}`}>{children}</div>
  );
}

/** The statement half of a tool section: display line, prose, one action. */
function ToolTerms({ terms }: { terms: { term: string; def: string }[] }) {
  return (
    <dl className="lg:pt-2">
      {terms.map((row) => (
        <div key={row.term} className="rule-t py-4">
          <dt className="t-label">{row.term}</dt>
          <dd className="t-body mt-2 text-[0.8125rem] leading-6">{row.def}</dd>
        </div>
      ))}
    </dl>
  );
}

function StartAction({ className = '' }: { className?: string }) {
  return (
    <PlateAnchor href="/login" variant="solid" className={className}>
      Start measuring
    </PlateAnchor>
  );
}

function DemoAction({ className = '' }: { className?: string }) {
  return (
    <PlateAnchor href="/demo" className={`hover:bg-plane ${className}`}>
      See a real run
    </PlateAnchor>
  );
}

export function LandingScreen() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-sheet)' }}>
      <header
        className="rule-b pt-safe sticky top-0 z-40"
        style={{ background: 'var(--color-sheet)' }}
      >
        <Band className="flex items-center justify-between gap-4 py-2.5">
          <a
            href="/hello"
            aria-label="wasgoht home"
            className="flex shrink-0 items-center gap-2.5 no-underline"
            style={{ color: 'var(--color-ink)' }}
          >
            <SuiteMark size={24} />
            <Wordmark brand="suite" className="text-base" />
          </a>
          <nav aria-label="Primary navigation" className="flex min-w-0 items-center gap-4 sm:gap-6">
            <a href="#dynorun" className="t-annotation hidden no-underline hover:underline md:inline">
              DynoRun
            </a>
            <a href="#grip" className="t-annotation hidden no-underline hover:underline md:inline">
              Grip
            </a>
            <a href="/demo" className="t-annotation hidden no-underline hover:underline sm:inline">
              See a real run
            </a>
            <StartAction />
          </nav>
        </Band>
      </header>

      <main className="flex-1">
        {/* The one earned accent plane, and the page's one authored moment. The
            photograph lives inside it so the dark opening reads as a single
            object; a second dark band on the sheet would read as a second
            accent and there is only ever one. */}
        <section aria-labelledby="landing-title" className="plane-ink plate-issue">
          <Band className="pt-12 pb-11 lg:pt-24 lg:pb-16">
            <h1
              id="landing-title"
              className="t-display max-w-[15ch]"
              style={{ color: 'var(--color-sheet)', fontSize: 'clamp(2.25rem, 8.4vw, 6rem)' }}
            >
              Change one thing.
              <br />
              Prove it worked.
            </h1>
            <p
              className="mt-7 max-w-[52ch] text-[1.0625rem] leading-[1.62]"
              style={{ color: onInk(78) }}
            >
              Measure wheel power from GPS. Find unused grip from RaceBox. Two tools on one
              account, for the drivers and riders who change something and then want to know
              whether it actually worked.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <PlateAnchor
                href="/login"
                className="hover:bg-sheet px-7"
                style={{ minHeight: 56, fontSize: '0.9375rem' }}
              >
                Start measuring
              </PlateAnchor>
              <a
                href="/demo"
                className="ctl hover:bg-ink-2 px-7 no-underline"
                style={{
                  minHeight: 56,
                  fontSize: '0.9375rem',
                  background: 'transparent',
                  color: 'var(--color-sheet)',
                  border: `1px solid ${onInk(38)}`,
                }}
              >
                See a real run
              </a>
            </div>
          </Band>

          {/* The figures are the sheet's monumental numerals, and they are the
              real output of the pipeline running directly above. */}
          <div style={{ borderTop: `1px solid ${onInk(18)}` }}>
            <Band>
              <dl className="grid grid-cols-2 lg:grid-cols-4">
                {HERO_FIGURES.map((f, i) => (
                  <div
                    key={f.label}
                    // Two up on a phone, four up from lg, and the divider moves
                    // from the row above to the column beside with it. Border
                    // widths come from utilities so they can be responsive; only
                    // the colour is inline, because it has to be mixed from the
                    // plate's own foreground rather than named as a token.
                    className={`py-6 pr-5 lg:py-9 ${i % 2 === 1 ? 'border-l pl-5' : ''} ${
                      i >= 2 ? 'border-t lg:border-t-0' : ''
                    } ${i > 0 ? 'lg:border-l lg:pl-5' : ''}`}
                    style={{ borderColor: onInk(16) }}
                  >
                    <dt className="t-annotation">{f.label}</dt>
                    <dd className="t-readout mt-3">
                      {f.value}
                      {f.unit && (
                        <span className="t-unit ml-1.5 align-baseline" style={{ fontSize: '0.28em' }}>
                          {f.unit}
                        </span>
                      )}
                    </dd>
                    <dd className="t-annotation mt-3">{f.note}</dd>
                  </div>
                ))}
              </dl>
            </Band>
          </div>

          <div style={{ borderTop: `1px solid ${onInk(18)}` }}>
            <Band className="py-4">
              {/* Set in normal case: this is a sentence, and the annotation
                  register's small caps are for two- or three-word marginalia. */}
              <p className="t-annotation max-w-[92ch] text-[0.75rem] leading-5 normal-case tracking-normal">
                Synthetic GPS trace and a synthetic RaceBox session, computed by the shipping
                analysis pipeline (v{PIPELINE_VERSION}) as this page rendered. Nothing here is
                a screenshot, and no vehicle was driven to produce it.
              </p>
            </Band>
          </div>

          <figure className="m-0">
            <picture>
              <source
                type="image/avif"
                media="(min-width: 768px)"
                srcSet="/media/wasgoht-track-hero-1536.avif"
              />
              <source
                type="image/webp"
                media="(min-width: 768px)"
                srcSet="/media/wasgoht-track-hero-1536.webp"
              />
              <source type="image/avif" srcSet="/media/wasgoht-track-hero-768.avif" />
              <source type="image/webp" srcSet="/media/wasgoht-track-hero-768.webp" />
              <img
                src="/media/wasgoht-track-hero-1536.webp"
                alt="An unbranded track car parked in a pit lane at dusk"
                width={1536}
                height={1024}
                loading="eager"
                decoding="async"
                className="block aspect-[16/10] w-full object-cover sm:aspect-[2/1] lg:aspect-[16/6]"
                style={{ objectPosition: '50% 58%' }}
              />
            </picture>
            <figcaption
              className="t-annotation"
              style={{ borderTop: `1px solid ${onInk(18)}`, padding: 0 }}
            >
              <Band className="py-4">Pit lane before a session. An illustration, not a measurement.</Band>
            </figcaption>
          </figure>
        </section>

        {/* The colophon strip: the four facts a visitor checks before reading on. */}
        <Band>
          <dl
            className="rule-b meta-grid"
            style={{ '--meta-cols': 4, '--meta-cols-narrow': 2 } as CSSProperties}
          >
            {SPEC_CELLS.map((cell) => (
              <div key={cell.label} className="meta-cell py-6 pr-4 pl-4 first:pl-0">
                <dt className="t-annotation">{cell.label}</dt>
                <dd className="t-data mt-2 text-sm leading-6">{cell.value}</dd>
              </div>
            ))}
          </dl>
        </Band>

        <section id="dynorun" aria-labelledby="dynorun-title">
          <Band className="pt-16 lg:pt-28">
            <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
              <div>
                <h2
                  id="dynorun-title"
                  className="t-display"
                  style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)' }}
                >
                  Calibrate once.
                  <br />
                  Then just ride.
                </h2>
                <p className="t-body mt-6">
                  Drive a single gear and the phone does the rest. One steady hold teaches it
                  your RPM from speed alone, and from then on every pull comes back as a wheel
                  power curve you can lay over the last one. A cleaner curve tells you more
                  than a peak number, and a noisy trace stays visibly noisy instead of being
                  averaged into something reassuring.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <StartAction />
                  <DemoAction />
                </div>
              </div>
              <ToolTerms terms={DYNO_TERMS} />
            </div>
          </Band>

          <Band className="mt-12 flex flex-col gap-2">
            <PlanView
              label="Wheel power vs RPM"
              scale={`${DEMO_GEAR}, ${DEMO_MASS_KG} kg, rollout ${DEMO_ROLLOUT_M_PER_REV} m/rev`}
              legend={
                <p className="t-annotation normal-case tracking-normal">
                  Solid: wheel power. Drawn by the shipping pipeline (v{PIPELINE_VERSION}) from
                  a synthetic 10 Hz GPS trace, in your browser, as this page rendered.
                </p>
              }
            >
              <div className="px-2 py-3">
                {/* Both renditions ship and CSS picks the one whose column it was
                    drawn for. Markup is the cheap side of this trade on a page
                    that loads no script at all; an unreadable axis on the surface
                    most visitors see is the expensive one. */}
                <div className="lg:hidden">
                  <PowerPlot w="narrow" />
                </div>
                <div className="hidden lg:block">
                  <PowerPlot w="wide" />
                </div>
              </div>
            </PlanView>

            <ProfileView label="Wheel torque vs RPM" axis="Same RPM axis, dashed">
              <div className="px-2 py-3">
                <div className="lg:hidden">
                  <TorquePlot w="narrow" />
                </div>
                <div className="hidden lg:block">
                  <TorquePlot w="wide" />
                </div>
              </div>
            </ProfileView>
          </Band>
        </section>

        <section id="grip" aria-labelledby="grip-title">
          <Band className="pt-16 lg:pt-28">
            <div className="grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
              <div>
                <h2
                  id="grip-title"
                  className="t-display"
                  style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)' }}
                >
                  Find the grip you left on track.
                </h2>
                <p className="t-body mt-6">
                  Drop in a RaceBox CSV and see the traction circle you actually used, corner
                  by corner, lap after lap. Every headline figure is an absolute score,
                  measured g demand times one hundred, so it stays comparable across laps,
                  sessions, bikes and riders instead of flattering your own best lap back at
                  you.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <StartAction />
                  <DemoAction />
                </div>
              </div>
              <ToolTerms terms={GRIP_TERMS} />
            </div>
          </Band>

          <Band className="mt-12 grid gap-2 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-start">
            <PlanView
              label="Traction circle"
              scale={`${GRIP_SAMPLES.length} samples, 4 laps`}
              legend={
                <p className="t-annotation normal-case tracking-normal">
                  Dots: one sample of demand. Outline: the envelope you reached.
                </p>
              }
            >
              <div className="px-3 py-3">
                <div className="lg:hidden">
                  <TractionCircle w="narrow" />
                </div>
                <div className="hidden lg:block">
                  <TractionCircle w="wide" />
                </div>
              </div>
            </PlanView>

            <div className="flex flex-col gap-2">
              <div className="plane grid grid-cols-2">
                <div className="px-4 py-5">
                  <Readout
                    label="Session score"
                    value={SESSION_SCORE}
                    note="100 is one g in every direction"
                  />
                </div>
                <div className="rule-l px-4 py-5">
                  <Readout
                    label="Peak combined"
                    value={PEAK_COMBINED.toFixed(2)}
                    unit="g"
                    note="Largest vector on the session"
                  />
                </div>
              </div>

              <Zone label="Per turn" note="Best of four laps at each track turn" flush>
                <MinimaTable
                  columns={TURN_COLUMNS}
                  rows={TURN_READINGS}
                  rowKey={(r) => `t${r.turn}`}
                />
              </Zone>
            </div>
          </Band>
        </section>

        <section aria-labelledby="procedure-title">
          <Band className="pt-16 lg:pt-28">
            <h2
              id="procedure-title"
              className="t-display"
              style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)' }}
            >
              Record. Compare. Decide.
            </h2>
            {/* Numbered because the order is the procedure: you cannot compare
                before you have recorded, and the whole product is the middle
                step. The numeral is this world's native device at this scale. */}
            <ol className="mt-10 grid lg:grid-cols-3">
              {PROCEDURE_STEPS.map((s, i) => (
                <li
                  key={s.step}
                  className={`rule-t py-6 lg:pr-8 ${i > 0 ? 'lg:rule-l lg:pl-8' : ''}`}
                >
                  <p
                    aria-hidden="true"
                    className="t-readout"
                    style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.5rem)' }}
                  >
                    {s.step}
                  </p>
                  <h3 className="t-plate-title mt-4">{s.name}</h3>
                  <p className="t-body mt-2.5 text-[0.8125rem] leading-6">{s.body}</p>
                </li>
              ))}
            </ol>
          </Band>
        </section>

        <section aria-labelledby="worth-title">
          <Band className="pt-16 lg:pt-28">
            <h2
              id="worth-title"
              className="t-display"
              style={{ fontSize: 'clamp(1.75rem, 3.4vw, 2.5rem)' }}
            >
              What these measurements are worth.
            </h2>
            <p className="t-body mt-5">
              Stating the limit next to the claim is part of the product, not a disclaimer
              bolted onto it. Both of these belong on the sheet.
            </p>
            {/* Zones rather than hand-built blocks so the label band and the
                advisory's own padding line up on the same edge, and so the
                caveats read as apparatus rather than as small print. */}
            <div className="mt-8 grid gap-2 lg:grid-cols-2">
              <Zone label="Wheel power" framed={false} className="plane-flat" flush>
                <Advisory>
                  Estimated from GPS acceleration, vehicle mass, gearing and road-load
                  assumptions. It is not a replacement for a calibrated rolling-road dyno.
                  Read it as a comparative measurement: the same vehicle, the same road,
                  before and after one change.
                </Advisory>
              </Zone>
              <Zone label="Grip" framed={false} className="plane-flat" flush>
                <Advisory>
                  Reflects GPS and IMU quality, tyre condition, rider inputs and the settings
                  you choose. It does not measure the tyre&apos;s absolute limit. The traction
                  envelope describes the boundary you reached, and is never used as a divisor.
                </Advisory>
              </Zone>
            </div>
          </Band>
        </section>

        <section aria-labelledby="closing-title">
          <Band className="rule-section mt-16 lg:mt-28">
            <div className="grid items-end gap-10 pt-14 pb-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-24 lg:pb-28">
              <div className="min-w-0">
                <h2
                  id="closing-title"
                  className="t-display max-w-[13ch]"
                  style={{ fontSize: 'clamp(2.4rem, 6.4vw, 4rem)' }}
                >
                  Make the next change count.
                </h2>
                <p className="t-body mt-7 text-[1.0625rem] leading-[1.6]">
                  Change one variable, keep the evidence, and make the next decision against a
                  baseline you can defend. Signing up takes an email address. The demo takes
                  nothing at all.
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <PlateAnchor
                    href="/login"
                    variant="solid"
                    className="px-8"
                    style={{ minHeight: 60, fontSize: '0.9375rem' }}
                  >
                    Start measuring
                  </PlateAnchor>
                  <PlateAnchor
                    href="/demo"
                    className="hover:bg-plane px-8"
                    style={{ minHeight: 60, fontSize: '0.9375rem' }}
                  >
                    See a real run
                  </PlateAnchor>
                </div>
              </div>
              {/* The registration cross is the mark a printed sheet carries to
                  prove it is aligned, so it closes the specimen rather than
                  decorating it. */}
              <div
                aria-hidden="true"
                className="hidden shrink-0 lg:block"
                style={{ color: 'var(--color-grid-strong)' }}
              >
                <SuiteMark size={176} />
              </div>
            </div>
          </Band>
        </section>

        <Band className="pb-14">
          <RevisionBar
            entries={[
              { label: 'Analysis pipeline', value: `v${PIPELINE_VERSION}` },
              { label: 'Demonstration data', value: 'Synthetic, computed on render' },
              { label: 'Grip metric', value: 'Absolute score, measured g x 100' },
              { label: 'Operated by', value: 'Johannes Nothstein, Switzerland' },
            ]}
          />
        </Band>
      </main>

      <footer className="rule-section mt-auto">
        <Band className="py-8">
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
            <a
              href="/hello"
              aria-label="wasgoht home"
              className="flex items-center gap-2.5 no-underline"
              style={{ color: 'var(--color-ink)' }}
            >
              <SuiteMark size={22} />
              <Wordmark brand="suite" className="text-[0.9375rem]" />
            </a>
            <nav
              aria-label="Footer navigation"
              className="flex flex-wrap items-center gap-x-6 gap-y-2"
            >
              <a href="/demo" className="t-annotation no-underline hover:underline">
                Demo
              </a>
              <a href="#dynorun" className="t-annotation no-underline hover:underline">
                DynoRun
              </a>
              <a href="/grip" className="t-annotation no-underline hover:underline">
                Grip
              </a>
              <a href="/login" className="t-annotation no-underline hover:underline">
                Sign in
              </a>
              <a href="/privacy" className="t-annotation no-underline hover:underline">
                Privacy
              </a>
              <a href="/imprint" className="t-annotation no-underline hover:underline">
                Imprint
              </a>
            </nav>
          </div>
          <p className="rule-t t-annotation mt-6 pt-4">
            Our friends:{' '}
            <a href="https://partynado.com" target="_blank" rel="noopener" className="underline">
              Partynado
            </a>
            . Find your party in Switzerland &amp; Germany.
          </p>
        </Band>
      </footer>
    </div>
  );
}
