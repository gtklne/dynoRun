const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const ms = now.getTime() - then.getTime();
  if (!isFinite(ms)) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 5) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} d ago`;
  const sameYear = now.getFullYear() === then.getFullYear();
  const md = `${MONTHS[then.getMonth()]} ${then.getDate()}`;
  return sameYear ? md : `${md}, ${then.getFullYear()}`;
}

export function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDurationMs(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '—';
  const total_s = Math.round(ms / 1000);
  const m = Math.floor(total_s / 60);
  const s = total_s % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
