import { describe, it, expect, afterEach, vi } from 'vitest';
import { SensorWatchdog } from '@/run/sensor-watchdog';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface Counts { stalls: number; maxes: number }

// Every watchdog built here is stopped after the test whatever the assertions
// did: a failed `waitFor` leaves the interval running otherwise, and a stray
// wall-clock interval fires inside whichever test happens to run next.
const live: SensorWatchdog[] = [];
afterEach(() => {
  for (const wd of live) wd.stop();
  live.length = 0;
});

/**
 * Millisecond-scale windows and real timers on purpose. The class compares
 * `Date.now()` against its own start, so fake timers would advance the interval
 * without advancing the clock it reads and nothing would ever come due.
 */
function watchdog(opts: { maxDurationMs?: number; stallMs?: number; tickMs?: number } = {}) {
  const counts: Counts = { stalls: 0, maxes: 0 };
  const wd = new SensorWatchdog({
    maxDurationMs: opts.maxDurationMs ?? 10_000,
    stallMs: opts.stallMs ?? 20,
    tickMs: opts.tickMs ?? 5,
    onMaxDuration: () => { counts.maxes++; },
    onStall: () => { counts.stalls++; },
  });
  live.push(wd);
  return { wd, counts };
}

describe('SensorWatchdog', () => {
  it('fires onStall when no sample arrives inside the stall window', async () => {
    const { wd, counts } = watchdog({ stallMs: 20, tickMs: 5 });
    wd.start();
    await vi.waitFor(() => expect(counts.stalls).toBe(1));
    expect(counts.maxes).toBe(0);
    wd.stop();
  });

  it('postpones the stall for as long as beat() keeps arriving', async () => {
    const { wd, counts } = watchdog({ stallMs: 80, tickMs: 10 });
    wd.start();
    const beater = setInterval(() => wd.beat(), 5);
    // Well past the stall window: without the beats this would have fired twice
    // over.
    await sleep(220);
    clearInterval(beater);
    expect(counts).toEqual({ stalls: 0, maxes: 0 });
    wd.stop();
  });

  it('fires onMaxDuration on wall clock even while samples keep arriving', async () => {
    const { wd, counts } = watchdog({ maxDurationMs: 50, stallMs: 10_000, tickMs: 5 });
    wd.start();
    const beater = setInterval(() => wd.beat(), 5);
    await vi.waitFor(() => expect(counts.maxes).toBe(1));
    clearInterval(beater);
    expect(counts.stalls).toBe(0);
    wd.stop();
  });

  it('prefers max duration over stall when both come due on the same tick', async () => {
    // Equal windows, and `start()` seeds the last beat with the start time, so
    // both deadlines land on the same tick and the tick order decides.
    const { wd, counts } = watchdog({ maxDurationMs: 30, stallMs: 30, tickMs: 5 });
    wd.start();
    await vi.waitFor(() => expect(counts.maxes).toBe(1));
    expect(counts.stalls).toBe(0);
    wd.stop();
  });

  it('latches after firing, so a second callback never follows', async () => {
    const { wd, counts } = watchdog({ stallMs: 20, tickMs: 5 });
    wd.start();
    await vi.waitFor(() => expect(counts.stalls).toBe(1));
    // Left running deliberately: the owner tears down asynchronously, and the
    // ticks in between must stay silent.
    await sleep(80);
    expect(counts).toEqual({ stalls: 1, maxes: 0 });
    wd.stop();
  });

  it('stop() prevents any firing at all', async () => {
    const { wd, counts } = watchdog({ maxDurationMs: 10, stallMs: 10, tickMs: 5 });
    wd.start();
    wd.stop();
    await sleep(80);
    expect(counts).toEqual({ stalls: 0, maxes: 0 });
  });

  it('start() on a running watchdog does not leave a second interval behind', async () => {
    const { wd, counts } = watchdog({ stallMs: 20, tickMs: 5 });
    wd.start();
    wd.start();
    await vi.waitFor(() => expect(counts.stalls).toBe(1));
    await sleep(60);
    expect(counts.stalls).toBe(1);

    // The count alone cannot see a duplicate interval, because the latch would
    // silence it too. Restarting clears the latch and `stop()` clears the one
    // handle the instance tracks, so anything still ticking would fire here.
    wd.start();
    wd.stop();
    await sleep(60);
    expect(counts).toEqual({ stalls: 1, maxes: 0 });
  });
});
