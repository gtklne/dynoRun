import { type CSSProperties } from 'react';
import { BrandLogo } from '@/ui/components/brand-logo';
import { SuiteMark, Wordmark } from '@/ui/components/brand-wordmark';

function Arrow() {
  return <span aria-hidden="true" className="landing-arrow">→</span>;
}

function PrimaryCta({ className = '' }: { className?: string }) {
  return (
    <a href="/login" className={`landing-button landing-button-primary ${className}`}>
      Start measuring <Arrow />
    </a>
  );
}

function DemoCta({ className = '' }: { className?: string }) {
  return (
    <a href="/demo" className={`landing-button landing-button-secondary ${className}`}>
      See a real run <Arrow />
    </a>
  );
}

function HeroImage() {
  return (
    <picture className="landing-hero-picture">
      <source
        media="(max-width: 767px)"
        type="image/avif"
        srcSet="/media/wasgoht-track-hero-768.avif"
        width="768"
        height="576"
      />
      <source
        media="(max-width: 767px)"
        type="image/webp"
        srcSet="/media/wasgoht-track-hero-768.webp"
        width="768"
        height="576"
      />
      <source
        type="image/avif"
        srcSet="/media/wasgoht-track-hero-1536.avif"
        width="1536"
        height="1024"
      />
      <img
        src="/media/wasgoht-track-hero-1536.webp"
        width="1536"
        height="1024"
        alt="Unbranded track car waiting in a quiet pit lane before a test session"
        loading="eager"
        decoding="async"
      />
    </picture>
  );
}

function DynoCapture() {
  return (
    <picture className="landing-product-picture landing-product-picture-dyno">
      <source
        media="(max-width: 767px)"
        type="image/avif"
        srcSet="/media/dynorun-capture-768.avif"
        width="768"
        height="672"
      />
      <source
        media="(max-width: 767px)"
        type="image/webp"
        srcSet="/media/dynorun-capture-768.webp"
        width="768"
        height="672"
      />
      <source
        type="image/avif"
        srcSet="/media/dynorun-capture-1200.avif"
        width="1200"
        height="750"
      />
      <img
        src="/media/dynorun-capture-1200.webp"
        width="1200"
        height="750"
        alt="DynoRun example run with GPS-derived wheel power curve, peak power, torque, and RPM"
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

function GripTractionCapture() {
  return (
    <picture className="landing-grip-traction">
      <source
        media="(max-width: 767px)"
        type="image/avif"
        srcSet="/media/grip-traction-520.avif"
        width="520"
        height="489"
      />
      <source
        media="(max-width: 767px)"
        type="image/webp"
        srcSet="/media/grip-traction-520.webp"
        width="520"
        height="489"
      />
      <source
        type="image/avif"
        srcSet="/media/grip-traction-824.avif"
        width="824"
        height="774"
      />
      <img
        src="/media/grip-traction-824.webp"
        width="824"
        height="774"
        alt="Grip traction-circle product capture showing lateral and longitudinal load from a sample RaceBox session"
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

function GripCornerCapture() {
  return (
    <picture className="landing-grip-corners">
      <source
        media="(max-width: 767px)"
        type="image/avif"
        srcSet="/media/grip-corners-720.avif"
        width="719"
        height="255"
      />
      <source
        media="(max-width: 767px)"
        type="image/webp"
        srcSet="/media/grip-corners-720.webp"
        width="719"
        height="255"
      />
      <source
        type="image/avif"
        srcSet="/media/grip-corners-1120.avif"
        width="1120"
        height="397"
      />
      <img
        src="/media/grip-corners-1120.webp"
        width="1120"
        height="397"
        alt="Grip corner-analysis product capture comparing apex load, speed, lean angle, and session bests"
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}

/**
 * Public marketing page shared by the SPA and the script-free build-time
 * prerender. Keep this component hook-free and use plain anchors for every
 * route so the standalone document remains fully navigable without JavaScript.
 */
export function LandingScreen() {
  return (
    <div className="landing-root min-h-screen overflow-x-clip bg-[#09090b] text-zinc-100">
      <header className="landing-nav pt-safe">
        <div className="landing-container flex h-[72px] items-center justify-between gap-4">
          <a href="/hello" aria-label="wasgoht home" className="flex shrink-0 items-center gap-2.5">
            <SuiteMark size={28} />
            <Wordmark brand="suite" className="text-lg font-bold tracking-tight" />
          </a>
          <nav aria-label="Primary navigation" className="flex min-w-0 items-center justify-end gap-5 sm:gap-7">
            <a href="#dynorun" className="landing-nav-link hidden md:inline">DynoRun</a>
            <a href="#grip" className="landing-nav-link hidden md:inline">Grip</a>
            <a href="/demo" className="landing-nav-link hidden sm:inline">See a real run</a>
            <PrimaryCta className="landing-nav-cta" />
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero landing-container" aria-labelledby="landing-hero-title">
          <div className="landing-hero-copy">
            <p className="landing-kicker landing-enter" style={{ '--landing-delay': '70ms' } as CSSProperties}>
              GPS dyno + grip analysis
            </p>
            <h1
              id="landing-hero-title"
              className="landing-display landing-hero-title landing-enter mt-5 max-w-[760px] text-[clamp(3.25rem,7.2vw,7.3rem)] font-black leading-[0.88] tracking-[-0.065em]"
              style={{ '--landing-delay': '140ms' } as CSSProperties}
            >
              Tune the car.<br />
              <span className="text-zinc-400">Prove the difference.</span>
            </h1>
            <p
              className="landing-enter mt-7 max-w-[590px] text-[15px] font-medium leading-6 text-zinc-300 sm:text-base sm:leading-7"
              style={{ '--landing-delay': '220ms' } as CSSProperties}
            >
              Measure wheel power from GPS. Find unused grip from RaceBox. One focused toolkit for drivers who test, compare, and improve.
            </p>
            <div
              className="landing-enter mt-7 flex flex-nowrap items-center gap-2.5 sm:gap-3"
              style={{ '--landing-delay': '300ms' } as CSSProperties}
            >
              <PrimaryCta />
              <DemoCta />
            </div>
          </div>
          <div className="landing-hero-media landing-enter" style={{ '--landing-delay': '180ms' } as CSSProperties}>
            <HeroImage />
          </div>
        </section>

        <section className="landing-credibility" aria-label="Product capabilities">
          <div className="landing-container">
            <dl className="landing-credibility-grid">
              <div>
                <dt>GPS analysis</dt>
                <dd>Power and torque curves from acceleration data.</dd>
              </div>
              <div>
                <dt>RaceBox support</dt>
                <dd>Import exported session CSV files in your browser.</dd>
              </div>
              <div>
                <dt>Browser access</dt>
                <dd>Review, compare, and share without desktop software.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="dynorun" className="landing-section landing-container" aria-labelledby="dynorun-title">
          <div className="landing-dyno-grid landing-reveal">
            <div className="landing-dyno-copy">
              <span className="flex items-center gap-2.5 text-sm font-bold text-zinc-100">
                <BrandLogo size={28} />
                <Wordmark brand="dynorun" className="text-lg font-bold tracking-tight" />
              </span>
              <h2 id="dynorun-title" className="landing-display mt-8 text-[clamp(3rem,6vw,6rem)] font-black leading-[0.92] tracking-[-0.055em]">
                Change one thing.<br />See if it worked.
              </h2>
              <p className="mt-6 max-w-[520px] text-base leading-7 text-zinc-300">
                Overlay runs on the same RPM axis. A cleaner curve tells you more than a peak number, and inconsistent GPS data stays visible.
              </p>
              <p className="landing-honesty-note mt-7 max-w-[520px]">
                Wheel power is estimated from GPS acceleration, vehicle mass, gearing, and road-load assumptions. It is not a replacement for a calibrated rolling-road dyno.
              </p>
              <PrimaryCta className="mt-8" />
            </div>
            <figure className="landing-dyno-figure">
              <DynoCapture />
              <figcaption>Actual DynoRun example analysis using a synthetic GPS trace.</figcaption>
            </figure>
          </div>
        </section>

        <section id="grip" className="landing-section landing-grip-section" aria-labelledby="grip-title">
          <div className="landing-container landing-reveal">
            <div className="landing-grip-copy">
              <Wordmark brand="grip" className="text-lg font-bold tracking-tight" />
              <h2 id="grip-title" className="landing-display mt-7 max-w-[900px] text-[clamp(3rem,6.4vw,6.5rem)] font-black leading-[0.92] tracking-[-0.055em]">
                Find the grip you left on track.
              </h2>
              <p className="mt-6 max-w-[620px] text-base leading-7 text-zinc-300">
                Import a RaceBox CSV to see the traction circle you used, then compare the same corner across laps.
              </p>
            </div>

            <div className="landing-grip-mosaic">
              <figure className="landing-grip-traction-frame">
                <GripTractionCapture />
              </figure>
              <figure className="landing-grip-corners-frame">
                <GripCornerCapture />
                <figcaption>Actual Grip analysis rendered from a sample RaceBox-style session.</figcaption>
              </figure>
            </div>

            <div className="landing-grip-outcome">
              <p className="landing-honesty-note max-w-[650px]">
                Grip analysis reflects GPS and IMU quality, tyre conditions, driver inputs, and the settings you choose. It does not measure the tyre&apos;s absolute limit.
              </p>
              <PrimaryCta />
            </div>
          </div>
        </section>

        <section className="landing-section landing-container" aria-labelledby="workflow-title">
          <div className="landing-workflow landing-reveal">
            <h2 id="workflow-title" className="landing-display text-[clamp(3rem,6.2vw,6.2rem)] font-black leading-[0.92] tracking-[-0.055em]">
              Record. Compare. Decide.
            </h2>
            <ol className="landing-workflow-list">
              <li>
                <h3>Record</h3>
                <p>Capture a clean GPS pull or import a RaceBox session.</p>
              </li>
              <li>
                <h3>Compare</h3>
                <p>Put runs and laps against curves, corners, and repeatability.</p>
              </li>
              <li>
                <h3>Decide</h3>
                <p>Keep the change that improved the data. Revisit the one that did not.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="landing-closing landing-container" aria-labelledby="closing-title">
          <div className="landing-closing-panel landing-reveal">
            <div className="landing-closing-mark" aria-hidden="true">
              <SuiteMark size={84} />
            </div>
            <div>
              <h2 id="closing-title" className="landing-display max-w-[850px] text-[clamp(3.2rem,7vw,7.2rem)] font-black leading-[0.88] tracking-[-0.065em]">
                Make the next change count.
              </h2>
              <p className="mt-6 max-w-[560px] text-base leading-7 text-zinc-300">
                Test one variable, keep the evidence, and make the next decision with a baseline you can trust.
              </p>
              <div className="mt-8 flex flex-nowrap items-center gap-2.5 sm:gap-3">
                <PrimaryCta />
                <DemoCta />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-primary">
            <a href="/hello" aria-label="wasgoht home" className="flex items-center gap-2.5">
              <SuiteMark size={24} />
              <Wordmark brand="suite" className="text-base font-bold tracking-tight" />
            </a>
            <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <a href="/demo">Demo</a>
              <a href="/grip">Grip</a>
              <a href="/privacy">Privacy</a>
              <a href="/imprint">Imprint</a>
            </nav>
          </div>
          <div className="landing-friends">
            <span>Our friends:</span>
            <a href="https://partynado.com" target="_blank" rel="noopener">Partynado</a>
            <span>Find your party in Switzerland &amp; Germany.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
