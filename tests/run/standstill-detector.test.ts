import { describe, it, expect } from 'vitest';
import { StandstillDetector } from '@/run/standstill-detector';
import { DEFAULT_STANDSTILL_CONFIG } from '@/run/types';
import { kmhToMps } from '@/shared/units';

/** Feeds `count` samples at a fixed cadence, holding one speed. */
function feed(d: StandstillDetector, from_ms: number, count: number, step_ms: number, kmh: number): number {
  let t = from_ms;
  for (let i = 0; i < count; i++) {
    d.push({ t_ms: t, speed_mps: kmhToMps(kmh) });
    t += step_ms;
  }
  return t - step_ms;
}

/** Rider pulls away and gets well past the arming speed. */
function ride(d: StandstillDetector, from_ms = 0): number {
  let t = from_ms;
  for (const kmh of [0, 12, 40, 80, 110, 60, 20]) {
    d.push({ t_ms: t, speed_mps: kmhToMps(kmh) });
    t += 1000;
  }
  return t - 1000;
}

describe('StandstillDetector', () => {
  it('never fires while unarmed, however long the vehicle is parked', () => {
    const d = new StandstillDetector();
    // Rider starts the session in the garage and takes three minutes to leave.
    feed(d, 0, 180, 1000, 0);
    expect(d.check()).toBe(false);
    const p = d.progress();
    expect(p.armed).toBe(false);
    expect(p.stopped).toBe(true);
    expect(p.elapsed_ms).toBe(179_000);
    expect(p.remaining_ms).toBe(DEFAULT_STANDSTILL_CONFIG.standstill_ms);
  });

  it('fires exactly at the configured window once armed', () => {
    const d = new StandstillDetector({ standstill_ms: 5000 });
    ride(d);
    d.push({ t_ms: 10_000, speed_mps: 0 });
    d.push({ t_ms: 14_999, speed_mps: 0 });
    expect(d.check()).toBe(false);
    d.push({ t_ms: 15_000, speed_mps: 0 });
    expect(d.check()).toBe(true);
  });

  it('does not fire before the window is full', () => {
    const d = new StandstillDetector({ standstill_ms: 20_000 });
    ride(d);
    const last = feed(d, 10_000, 20, 1000, 0);
    expect(last).toBe(29_000);
    expect(d.progress().elapsed_ms).toBe(19_000);
    expect(d.progress().remaining_ms).toBe(1000);
    expect(d.check()).toBe(false);
  });

  it('restarts the window on a single sample above the stopped threshold', () => {
    const d = new StandstillDetector({ standstill_ms: 10_000 });
    ride(d);
    feed(d, 10_000, 9, 1000, 0);
    expect(d.progress().elapsed_ms).toBe(8000);
    // Rider blips forward a metre to reach the pump.
    d.push({ t_ms: 19_000, speed_mps: kmhToMps(7) });
    expect(d.progress().stopped).toBe(false);
    expect(d.progress().elapsed_ms).toBe(0);
    expect(d.check()).toBe(false);

    feed(d, 20_000, 10, 1000, 0);
    expect(d.progress().elapsed_ms).toBe(9000);
    expect(d.check()).toBe(false);
    d.push({ t_ms: 30_000, speed_mps: 0 });
    expect(d.check()).toBe(true);
  });

  it('counts a sample at the stopped threshold as stopped, and one above it as moving', () => {
    const d = new StandstillDetector({ standstill_ms: 3000, stopped_speed_kmh: 5 });
    ride(d);
    d.push({ t_ms: 10_000, speed_mps: kmhToMps(5) });
    d.push({ t_ms: 13_000, speed_mps: kmhToMps(5) });
    expect(d.check()).toBe(true);

    const e = new StandstillDetector({ standstill_ms: 3000, stopped_speed_kmh: 5 });
    ride(e);
    e.push({ t_ms: 10_000, speed_mps: kmhToMps(5.1) });
    e.push({ t_ms: 13_000, speed_mps: kmhToMps(5.1) });
    expect(e.check()).toBe(false);
  });

  it('arms at exactly the arm speed', () => {
    const d = new StandstillDetector({ standstill_ms: 2000, arm_speed_kmh: 25 });
    d.push({ t_ms: 0, speed_mps: kmhToMps(24.9) });
    d.push({ t_ms: 1000, speed_mps: 0 });
    d.push({ t_ms: 3000, speed_mps: 0 });
    expect(d.check()).toBe(false);

    d.push({ t_ms: 4000, speed_mps: kmhToMps(25) });
    d.push({ t_ms: 5000, speed_mps: 0 });
    d.push({ t_ms: 7000, speed_mps: 0 });
    expect(d.check()).toBe(true);
  });

  it('keeps arming across a later slow crawl that never reaches the arm speed again', () => {
    const d = new StandstillDetector({ standstill_ms: 5000 });
    ride(d);
    // Twenty minutes of stop-and-go traffic, all below the arm speed.
    let t = 10_000;
    for (let i = 0; i < 600; i++) {
      d.push({ t_ms: t, speed_mps: kmhToMps(i % 2 === 0 ? 0 : 8) });
      t += 1000;
    }
    expect(d.progress().armed).toBe(true);
    expect(d.check()).toBe(false);

    feed(d, t, 6, 1000, 0);
    expect(d.progress().armed).toBe(true);
    expect(d.check()).toBe(true);
  });

  it('clamps remaining_ms at 0 once the window is overrun', () => {
    const d = new StandstillDetector({ standstill_ms: 20_000 });
    ride(d);
    feed(d, 10_000, 60, 1000, 0);
    const p = d.progress();
    expect(p.elapsed_ms).toBe(59_000);
    expect(p.remaining_ms).toBe(0);
    expect(d.check()).toBe(true);
  });

  it('reports progress through a full park sequence', () => {
    const d = new StandstillDetector({ standstill_ms: 10_000 });
    expect(d.progress()).toEqual({ armed: false, stopped: false, elapsed_ms: 0, remaining_ms: 10_000 });

    ride(d);
    expect(d.progress()).toEqual({ armed: true, stopped: false, elapsed_ms: 0, remaining_ms: 10_000 });

    d.push({ t_ms: 10_000, speed_mps: 0 });
    expect(d.progress()).toEqual({ armed: true, stopped: true, elapsed_ms: 0, remaining_ms: 10_000 });

    d.push({ t_ms: 14_000, speed_mps: 0 });
    expect(d.progress()).toEqual({ armed: true, stopped: true, elapsed_ms: 4000, remaining_ms: 6000 });
  });

  it('reset clears arming as well as the window', () => {
    const d = new StandstillDetector({ standstill_ms: 5000 });
    ride(d);
    feed(d, 10_000, 6, 1000, 0);
    expect(d.check()).toBe(true);

    d.reset();
    expect(d.progress()).toEqual({ armed: false, stopped: false, elapsed_ms: 0, remaining_ms: 5000 });
    expect(d.check()).toBe(false);

    // Standstill alone must not fire again: the detector has to be re-armed.
    feed(d, 20_000, 60, 1000, 0);
    expect(d.check()).toBe(false);
  });

  it('finishes a realistic 1 Hz session: parked, ridden, parked again', () => {
    const d = new StandstillDetector();
    let t = 0;
    // 30 s of pre-ride fiddling in the garage.
    t = feed(d, t, 30, 1000, 0) + 1000;
    expect(d.check()).toBe(false);
    // A pull to 130 km/h and back down.
    for (const kmh of [10, 35, 70, 100, 130, 120, 90, 50, 20, 6]) {
      d.push({ t_ms: t, speed_mps: kmhToMps(kmh) });
      t += 1000;
    }
    expect(d.check()).toBe(false);
    // Stopped at the lights: 19 s is not enough.
    t = feed(d, t, 20, 1000, 0) + 1000;
    expect(d.check()).toBe(false);
    d.push({ t_ms: t, speed_mps: 0 });
    expect(d.check()).toBe(true);
    expect(d.progress().remaining_ms).toBe(0);
  });

  it('works with irregular sample spacing', () => {
    const d = new StandstillDetector({ standstill_ms: 20_000 });
    ride(d);
    // GPS at a ragged cadence, including a 9 s gap under a bridge.
    const stops = [10_040, 11_120, 12_310, 21_400, 22_090, 27_500, 30_039];
    for (const t_ms of stops) d.push({ t_ms, speed_mps: kmhToMps(1.4) });
    expect(d.progress().elapsed_ms).toBe(30_039 - 10_040);
    expect(d.check()).toBe(false);
    d.push({ t_ms: 30_041, speed_mps: 0 });
    expect(d.check()).toBe(true);
  });

  it('defaults are the shared config', () => {
    const d = new StandstillDetector();
    expect(d.progress().remaining_ms).toBe(20_000);
    d.push({ t_ms: 0, speed_mps: kmhToMps(DEFAULT_STANDSTILL_CONFIG.arm_speed_kmh) });
    d.push({ t_ms: 1000, speed_mps: kmhToMps(DEFAULT_STANDSTILL_CONFIG.stopped_speed_kmh) });
    d.push({ t_ms: 21_000, speed_mps: 0 });
    expect(d.check()).toBe(true);
  });
});
