import { analyzeRun } from '@/analysis/pipeline';
import { PIPELINE_VERSION, type RawSpeedSample } from '@/analysis/types';
import { SuiteMark, Wordmark, GripMark } from '@/ui/components/brand-wordmark';
import { BrandLogo } from '@/ui/components/brand-logo';
import {
  MinimaTable,
  NotesBox,
  PlanView,
  Plate,
  PlateAnchor,
  ProfileView,
  Readout,
  RevisionBar,
  TitleBlock,
  Zone,
  type MinimaColumn,
} from '@/ui/plate';

/**
 * The public landing page, and the product's own document type rendering the
 * product's own output.
 *
 * Everything plotted below is computed at module scope by the shipping analysis
 * pipeline (`analyzeRun`) and by the same traction-envelope construction the
 * Grip analyzer uses, from synthetic input the page names as synthetic. No
 * screenshots: a picture of the app goes stale the moment the app changes, and
 * a plate that draws its own data is the argument.
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
        out.push({ lat: (rand() > 0.5 ? lat : -lat), along, turn: shape.turn });
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

const PLAN_W = 680;
const PLAN_H = 300;
const PROFILE_H = 150;
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

function xAt(rpm: number): number {
  return PAD_L + ((rpm - RPM_MIN) / (RPM_MAX - RPM_MIN)) * (PLAN_W - PAD_L - PAD_R);
}

function yAt(value: number, max: number, height: number): number {
  return height - PAD_B - (value / max) * (height - PAD_T - PAD_B);
}

function polyline(
  read: (p: (typeof DYNO_POINTS)[number]) => number,
  max: number,
  height: number,
): string {
  return DYNO_POINTS.map((p) => `${xAt(p.rpm).toFixed(1)},${yAt(read(p), max, height).toFixed(1)}`)
    .join(' ');
}

/** The plan view: the field the procedure is flown across. */
function PowerPlot() {
  const peakX = xAt(PEAK_POWER.rpm);
  const peakY = yAt(PEAK_POWER.wheel_power_kw, POWER_MAX, PLAN_H);
  return (
    <svg
      viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
      role="img"
      aria-label={`Wheel power against engine RPM, peaking at ${PEAK_POWER.wheel_power_kw.toFixed(0)} kilowatts near ${PEAK_POWER.rpm.toFixed(0)} RPM`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {POWER_TICKS.map((t) => (
        <g key={t}>
          <line
            x1={PAD_L}
            x2={PLAN_W - PAD_R}
            y1={yAt(t, POWER_MAX, PLAN_H)}
            y2={yAt(t, POWER_MAX, PLAN_H)}
            className="stroke-rule-faint"
            strokeWidth="1"
          />
          <text
            x={PAD_L - 8}
            y={yAt(t, POWER_MAX, PLAN_H) + 3.5}
            textAnchor="end"
            className="fill-ink-3"
            style={{ fontSize: 10, fontStretch: '75%', fontWeight: 600 }}
          >
            {t}
          </text>
        </g>
      ))}
      {RPM_TICKS.map((r) => (
        <g key={r}>
          <line
            x1={xAt(r)}
            x2={xAt(r)}
            y1={PAD_T}
            y2={PLAN_H - PAD_B}
            className="stroke-rule-faint"
            strokeWidth="1"
          />
          <text
            x={xAt(r)}
            y={PLAN_H - PAD_B + 15}
            textAnchor="middle"
            className="fill-ink-3"
            style={{ fontSize: 10, fontStretch: '75%', fontWeight: 600 }}
          >
            {r}
          </text>
        </g>
      ))}
      <line
        x1={PAD_L}
        x2={PLAN_W - PAD_R}
        y1={PLAN_H - PAD_B}
        y2={PLAN_H - PAD_B}
        className="stroke-ink"
        strokeWidth="1.5"
      />
      <line
        x1={PAD_L}
        x2={PAD_L}
        y1={PAD_T}
        y2={PLAN_H - PAD_B}
        className="stroke-ink"
        strokeWidth="1.5"
      />
      <polyline
        points={polyline((p) => p.wheel_power_kw, POWER_MAX, PLAN_H)}
        fill="none"
        className="stroke-procedure"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <g>
        <line
          x1={peakX}
          x2={peakX}
          y1={peakY}
          y2={PLAN_H - PAD_B}
          className="stroke-procedure"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle cx={peakX} cy={peakY} r="3.5" className="fill-procedure" />
        <text
          x={peakX - 8}
          y={peakY - 8}
          textAnchor="end"
          className="fill-ink"
          style={{ fontSize: 12, fontStretch: '87%', fontWeight: 700 }}
        >
          {PEAK_POWER.wheel_power_kw.toFixed(0)} kW at {PEAK_POWER.rpm.toFixed(0)} RPM
        </text>
      </g>
      <text
        x={PAD_L}
        y={11}
        className="fill-ink-3"
        style={{ fontSize: 9, fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        KW
      </text>
      <text
        x={PLAN_W - PAD_R}
        y={11}
        textAnchor="end"
        className="fill-ink-3"
        style={{ fontSize: 9, fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        RPM
      </text>
    </svg>
  );
}

/** The profile view: the same axis, one level down. */
function TorquePlot() {
  return (
    <svg
      viewBox={`0 0 ${PLAN_W} ${PROFILE_H}`}
      role="img"
      aria-label={`Wheel torque against the same RPM axis, peaking at ${PEAK_TORQUE.wheel_torque_nm.toFixed(0)} newton metres`}
      style={{ display: 'block', width: '100%', height: 'auto' }}
    >
      {[0, TORQUE_MAX / 2, TORQUE_MAX].map((t) => (
        <g key={t}>
          <line
            x1={PAD_L}
            x2={PLAN_W - PAD_R}
            y1={yAt(t, TORQUE_MAX, PROFILE_H)}
            y2={yAt(t, TORQUE_MAX, PROFILE_H)}
            className="stroke-rule-faint"
            strokeWidth="1"
          />
          <text
            x={PAD_L - 8}
            y={yAt(t, TORQUE_MAX, PROFILE_H) + 3.5}
            textAnchor="end"
            className="fill-ink-3"
            style={{ fontSize: 10, fontStretch: '75%', fontWeight: 600 }}
          >
            {t}
          </text>
        </g>
      ))}
      {RPM_TICKS.map((r) => (
        <line
          key={r}
          x1={xAt(r)}
          x2={xAt(r)}
          y1={PAD_T}
          y2={PROFILE_H - PAD_B}
          className="stroke-rule-faint"
          strokeWidth="1"
        />
      ))}
      <line
        x1={PAD_L}
        x2={PLAN_W - PAD_R}
        y1={PROFILE_H - PAD_B}
        y2={PROFILE_H - PAD_B}
        className="stroke-ink"
        strokeWidth="1.5"
      />
      <polyline
        points={polyline((p) => p.wheel_torque_nm, TORQUE_MAX, PROFILE_H)}
        fill="none"
        className="stroke-ink"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <text
        x={PAD_L}
        y={11}
        className="fill-ink-3"
        style={{ fontSize: 9, fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        NM
      </text>
      {RPM_TICKS.map((r) => (
        <text
          key={r}
          x={xAt(r)}
          y={PROFILE_H - PAD_B + 15}
          textAnchor="middle"
          className="fill-ink-3"
          style={{ fontSize: 10, fontStretch: '75%', fontWeight: 600 }}
        >
          {r}
        </text>
      ))}
    </svg>
  );
}

const CIRCLE_SIZE = 340;
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
function TractionCircle() {
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
        <g key={g}>
          <circle
            cx={CIRCLE_C}
            cy={CIRCLE_C}
            r={(g / CIRCLE_G) * CIRCLE_R}
            fill="none"
            className="stroke-rule-faint"
            strokeWidth="1"
          />
          <text
            x={CIRCLE_C + (g / CIRCLE_G) * CIRCLE_R - 4}
            y={CIRCLE_C - 5}
            textAnchor="end"
            className="fill-ink-3"
            style={{ fontSize: 9, fontStretch: '75%', fontWeight: 700, letterSpacing: '0.08em' }}
          >
            {g.toFixed(1)} G
          </text>
        </g>
      ))}
      <line
        x1={CIRCLE_C - CIRCLE_R}
        x2={CIRCLE_C + CIRCLE_R}
        y1={CIRCLE_C}
        y2={CIRCLE_C}
        className="stroke-rule"
        strokeWidth="1"
      />
      <line
        x1={CIRCLE_C}
        x2={CIRCLE_C}
        y1={CIRCLE_C - CIRCLE_R}
        y2={CIRCLE_C + CIRCLE_R}
        className="stroke-rule"
        strokeWidth="1"
      />
      {/* One fill for the whole scatter: 300-odd per-circle class attributes is
          real weight in a document that inlines everything it ships. */}
      <g className="fill-terrain">
        {GRIP_SAMPLES.map((s, i) => (
          <circle key={i} cx={gx(s.lat).toFixed(1)} cy={gy(s.along).toFixed(1)} r="2" />
        ))}
      </g>
      <polygon
        points={envelopePoints}
        fill="none"
        className="stroke-procedure"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <text
        x={CIRCLE_C}
        y={13}
        textAnchor="middle"
        className="fill-ink-3"
        style={{ fontSize: 9, fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        DRIVE
      </text>
      <text
        x={CIRCLE_C}
        y={CIRCLE_SIZE - 4}
        textAnchor="middle"
        className="fill-ink-3"
        style={{ fontSize: 9, fontStretch: '75%', fontWeight: 700, letterSpacing: '0.09em' }}
      >
        BRAKE
      </text>
    </svg>
  );
}

/* ----------------------------------------------------------------- table --- */

interface MinimaRow {
  key: string;
  reading: string;
  value: string;
  derivation: string;
}

const MINIMA_ROWS: MinimaRow[] = [
  {
    key: 'power',
    reading: 'Peak wheel power',
    value: `${PEAK_POWER.wheel_power_kw.toFixed(0)} kW`,
    derivation: 'F = ma from GPS speed, then P = Fv',
  },
  {
    key: 'torque',
    reading: 'Peak wheel torque',
    value: `${PEAK_TORQUE.wheel_torque_nm.toFixed(0)} Nm`,
    derivation: 'P divided by angular velocity',
  },
  {
    key: 'rpm',
    reading: 'RPM at peak power',
    value: `${PEAK_POWER.rpm.toFixed(0)} RPM`,
    derivation: 'Speed divided by rollout, one calibrated number',
  },
  {
    key: 'bins',
    reading: 'Bins in the curve',
    value: String(DYNO_POINTS.length),
    derivation: '100 RPM bins over the accel phase',
  },
  {
    key: 'score',
    reading: 'Session grip score',
    value: String(SESSION_SCORE),
    derivation: '100 x RMS envelope radius',
  },
  {
    key: 'combined',
    reading: 'Peak combined demand',
    value: `${PEAK_COMBINED.toFixed(2)} g`,
    derivation: 'Largest combined vector on the session',
  },
];

const MINIMA_COLUMNS: MinimaColumn<MinimaRow>[] = [
  { key: 'reading', head: 'Reading', cell: (r) => r.reading },
  { key: 'value', head: 'Value', numeric: true, cell: (r) => r.value },
  { key: 'derivation', head: 'How it is derived', cell: (r) => r.derivation },
];

const TURN_COLUMNS: MinimaColumn<TurnReading>[] = [
  { key: 'turn', head: 'Turn', cell: (r) => `T${r.turn}` },
  { key: 'brake', head: 'Brake g', numeric: true, cell: (r) => r.brake.toFixed(2) },
  { key: 'apex', head: 'Apex lat g', numeric: true, cell: (r) => r.apex.toFixed(2) },
  { key: 'drive', head: 'Drive g', numeric: true, cell: (r) => r.drive.toFixed(2) },
  { key: 'score', head: 'Score', numeric: true, cell: (r) => String(r.score) },
];

/* ---------------------------------------------------------------- screen --- */

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

function StartAction({ className = '' }: { className?: string }) {
  return (
    <PlateAnchor href="/login" variant="solid" className={className}>
      Start measuring
    </PlateAnchor>
  );
}

function DemoAction({ className = '' }: { className?: string }) {
  return (
    <PlateAnchor href="/demo" className={className}>
      See a real run
    </PlateAnchor>
  );
}

export function LandingScreen() {
  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-sheet)' }}>
      <header className="rule-b pt-safe sticky top-0 z-40" style={{ background: 'var(--color-sheet)' }}>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2.5 lg:px-8">
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
        </div>
      </header>

      <main className="flex-1 px-4 pt-6 pb-14 lg:px-8 lg:pt-10">
        <Plate className="plate-issue mx-auto w-full max-w-6xl">
          <TitleBlock
            ident="wasgoht"
            title="GPS dyno and grip analysis for drivers"
            meta={[
              { label: 'GPS analysis', value: 'Power and torque curves from acceleration data.' },
              { label: 'RaceBox support', value: 'Import exported session CSV files in your browser.' },
              { label: 'Browser access', value: 'Review, compare, and share without desktop software.' },
              { label: 'Hardware', value: 'A phone. No rollers, no dongle, no drum.' },
            ]}
          />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
            <div className="flex flex-col gap-3">
              <PlanView
                label="Wheel power vs RPM"
                scale={`${DEMO_GEAR}, ${DEMO_MASS_KG} kg, rollout ${DEMO_ROLLOUT_M_PER_REV} m/rev`}
                legend={
                  <p className="t-annotation">
                    Synthetic GPS trace, analysed by the shipping pipeline (v{PIPELINE_VERSION}).
                    Nothing on this sheet is a screenshot.
                  </p>
                }
              >
                <div className="px-2 py-2">
                  <PowerPlot />
                </div>
              </PlanView>

              <ProfileView label="Wheel torque vs RPM" axis="Same RPM axis as above">
                <div className="px-2 py-2">
                  <TorquePlot />
                </div>
              </ProfileView>
            </div>

            {/* Named by its own heading rather than by a Zone label: a label set
                above a display line reads as an eyebrow, and this world has none. */}
            <section aria-labelledby="landing-thesis">
              <h2 id="landing-thesis" className="t-display text-[clamp(2.4rem,5vw,3.6rem)]">
                Change one thing.
                <br />
                Prove it worked.
              </h2>
              <p className="t-body mt-5">
                Measure wheel power from GPS. Find unused grip from RaceBox. One focused
                toolkit for the drivers and riders who test, compare, and improve, and one
                document type for both: the sheet on the left is exactly what the app draws
                for a run.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <StartAction />
                <DemoAction />
              </div>
              <dl className="mt-8">
                <div className="rule-t flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="t-annotation">Peak wheel power</dt>
                  <dd className="t-data text-sm">{PEAK_POWER.wheel_power_kw.toFixed(0)} kW</dd>
                </div>
                <div className="rule-t flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="t-annotation">Peak wheel torque</dt>
                  <dd className="t-data text-sm">{PEAK_TORQUE.wheel_torque_nm.toFixed(0)} Nm</dd>
                </div>
                <div className="rule-t flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="t-annotation">Hardware needed</dt>
                  <dd className="t-data text-sm">A phone</dd>
                </div>
              </dl>
            </section>
          </div>

          <Zone
            label="Minima"
            note="Every figure on this page, and where it comes from"
          >
            <MinimaTable
              columns={MINIMA_COLUMNS}
              rows={MINIMA_ROWS}
              rowKey={(r) => r.key}
              caption="Derived from synthetic input by the shipping analysis code, not typed in by hand."
            />
          </Zone>

          <section id="dynorun" aria-labelledby="dynorun-title">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <BrandLogo size={22} />
              <Wordmark brand="dynorun" className="text-sm" />
            </div>
            <div className="box-frame grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="px-4 py-5 lg:px-5">
                <h2 id="dynorun-title" className="t-display text-[clamp(1.9rem,3.6vw,2.7rem)]">
                  Calibrate once.
                  <br />
                  Then just ride.
                </h2>
                <p className="t-body mt-4">
                  Calibrate a gear once and the phone knows your RPM from speed alone.
                  Then overlay runs on the same axis. A cleaner curve tells you more than a
                  peak number, and inconsistent GPS data stays visible instead of being
                  averaged away.
                </p>
                <div className="mt-6">
                  <StartAction />
                </div>
              </div>
              <dl className="border-rule border-t lg:border-l lg:border-t-0">
                {[
                  { term: 'Calibration', def: 'One steady hold at a known RPM captures rollout in metres per rev: tyre, gearbox and final drive in a single number.' },
                  { term: 'Capture', def: 'Drivers watch the screen. Riders pocket the phone, ride, and pick the pulls afterwards.' },
                  { term: 'Output', def: 'Wheel power and torque in 100 RPM bins, plus accel times and the raw trace behind them.' },
                ].map((row, i) => (
                  <div key={row.term} className={`px-4 py-4 lg:px-5 ${i > 0 ? 'rule-t' : ''}`}>
                    <dt className="t-label">{row.term}</dt>
                    <dd className="t-body mt-1.5 text-[0.8125rem] leading-6">{row.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section id="grip" aria-labelledby="grip-title">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <GripMark size={22} />
              <Wordmark brand="grip" className="text-sm" />
            </div>
            <h2 id="grip-title" className="t-display text-[clamp(1.9rem,3.6vw,2.7rem)]">
              Find the grip you left on track.
            </h2>
            <p className="t-body mt-4">
              Import a RaceBox CSV to see the traction circle you actually used, then compare
              the same turn across laps. Every headline figure is an absolute score, measured
              g demand times one hundred, so it is comparable across laps, sessions, bikes and
              riders instead of flattering your own best lap.
            </p>

            <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
              <PlanView
                label="Traction circle"
                scale={`${GRIP_SAMPLES.length} samples, 4 laps`}
                legend={
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <span className="t-annotation">Grey: one sample of demand</span>
                    <span className="t-annotation" style={{ color: 'var(--color-procedure)' }}>
                      Magenta: the envelope you reached
                    </span>
                  </div>
                }
              >
                <div className="px-3 py-3">
                  <TractionCircle />
                </div>
              </PlanView>

              <div className="flex flex-col gap-6">
                <div className="box-frame grid grid-cols-2">
                  <div className="px-3 py-3">
                    <Readout
                      label="Session score"
                      value={SESSION_SCORE}
                      tone="procedure"
                      note="100 is one g in every direction"
                    />
                  </div>
                  <div className="rule-l px-3 py-3">
                    <Readout
                      label="Peak combined"
                      value={PEAK_COMBINED.toFixed(2)}
                      unit="g"
                      note="Largest vector on the session"
                    />
                  </div>
                </div>

                <Zone label="Per turn" note="Best of four laps at each track turn">
                  <MinimaTable
                    columns={TURN_COLUMNS}
                    rows={TURN_READINGS}
                    rowKey={(r) => `t${r.turn}`}
                  />
                </Zone>
              </div>
            </div>
          </section>

          <NotesBox title="Notes: what these measurements are worth">
            <p>
              Wheel power is estimated from GPS acceleration, vehicle mass, gearing, and
              road-load assumptions. It is not a replacement for a calibrated rolling-road
              dyno. Treat it as a comparative measurement: the same car, the same road, before
              and after a change.
            </p>
            <p className="mt-3">
              Grip analysis reflects GPS and IMU quality, tyre conditions, driver inputs, and
              the settings you choose. It does not measure the tyre&apos;s absolute limit. The
              traction envelope describes what you reached, and is never used as a divisor.
            </p>
            <p className="mt-3">
              The curve, the circle and both tables on this page are computed live from
              synthetic input by the same code that runs on your data. No vehicle was driven
              to produce them.
            </p>
          </NotesBox>

          <Zone label="Procedure" note="Record. Compare. Decide.">
            <ol className="grid lg:grid-cols-3">
              {PROCEDURE_STEPS.map((s, i) => (
                <li
                  key={s.step}
                  className={`border-rule px-4 py-4 ${i > 0 ? 'border-t lg:border-l lg:border-t-0' : ''}`}
                >
                  <p className="t-annotation">{s.step}</p>
                  <h3 className="t-plate-title mt-1.5">{s.name}</h3>
                  <p className="t-body mt-2 text-[0.8125rem] leading-6">{s.body}</p>
                </li>
              ))}
            </ol>
          </Zone>

          <section aria-labelledby="closing-title" className="box-frame px-4 py-8 sm:px-8 sm:py-10">
            <h2 id="closing-title" className="t-display text-[clamp(2.2rem,4.6vw,3.4rem)]">
              Make the next change count.
            </h2>
            <p className="t-body mt-5">
              Test one variable, keep the evidence, and make the next decision against a
              baseline you can defend. Sign-up takes an email address, and the demo takes
              nothing at all.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <StartAction />
              <DemoAction />
            </div>
          </section>

          <RevisionBar
            entries={[
              { label: 'Analysis pipeline', value: `v${PIPELINE_VERSION}` },
              { label: 'Demonstration data', value: 'Synthetic, generated at build time' },
              { label: 'Grip metric', value: 'Absolute score, measured g x 100' },
              { label: 'Operated by', value: 'Johannes Nothstein, Switzerland' },
            ]}
          />
        </Plate>
      </main>

      <footer className="rule-section mt-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
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
              <a href="/demo" className="t-annotation no-underline hover:underline">Demo</a>
              <a href="/grip" className="t-annotation no-underline hover:underline">Grip</a>
              <a href="/login" className="t-annotation no-underline hover:underline">Sign in</a>
              <a href="/privacy" className="t-annotation no-underline hover:underline">Privacy</a>
              <a href="/imprint" className="t-annotation no-underline hover:underline">Imprint</a>
            </nav>
          </div>
          <p className="rule-t t-annotation mt-6 pt-4">
            Our friends:{' '}
            <a href="https://partynado.com" target="_blank" rel="noopener" className="underline">
              Partynado
            </a>
            . Find your party in Switzerland &amp; Germany.
          </p>
        </div>
      </footer>
    </div>
  );
}
