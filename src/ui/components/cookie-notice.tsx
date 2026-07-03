import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const STORAGE_KEY = 'dynorun:cookie-notice-dismissed';

function readDismissedInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function CookieNotice() {
  const location = useLocation();
  const [dismissed, setDismissed] = useState(readDismissedInitial);

  if (dismissed || location.pathname.startsWith('/share/')) return null;

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch { /* noop */ }
    setDismissed(true);
  }

  return (
    <div className="pb-safe fixed bottom-16 left-0 right-0 z-[80] flex justify-center px-4 lg:bottom-4">
      <div className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 shadow-lg">
        <p className="flex-1 text-xs leading-snug text-zinc-400">
          We only use a strictly necessary cookie to keep you signed in — no
          tracking or analytics.{' '}
          <Link to="/privacy" className="text-amber-400 hover:underline">
            Learn more
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-3 py-1.5 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}
