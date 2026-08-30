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
      <aside
        className="box-frame flex w-full max-w-xl items-center gap-3 px-3 py-2.5"
        aria-label="Cookie notice"
      >
        <div className="min-w-0 flex-1">
          <p className="t-annotation mb-1">Cookies</p>
          <p className="t-body m-0 text-[0.8125rem] leading-6">
            We only use a strictly necessary cookie to keep you signed in, with no
            tracking or analytics.{' '}
            <Link to="/privacy" className="underline" style={{ color: 'var(--color-ink)' }}>
              Learn more
            </Link>
          </p>
        </div>
        <button type="button" onClick={dismiss} className="ctl shrink-0">
          OK
        </button>
      </aside>
    </div>
  );
}
