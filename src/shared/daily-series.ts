export interface DayCount {
  day: string; // YYYY-MM-DD (UTC)
  count: number;
}

const DAY_MS = 86_400_000;

function utcDayStart(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function toDayString(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Expand sparse per-day counts into a dense series covering the last `days`
 * days up to `today` (inclusive), inserting 0 for missing days. Charts need
 * the gaps made explicit — otherwise quiet days silently disappear and the
 * x-axis lies about the cadence.
 */
export function fillDailySeries(sparse: DayCount[], days: number, today: string): DayCount[] {
  const byDay = new Map(sparse.map((d) => [d.day, d.count]));
  const end = utcDayStart(today);
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = toDayString(end - i * DAY_MS);
    out.push({ day, count: byDay.get(day) ?? 0 });
  }
  return out;
}
