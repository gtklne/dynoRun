import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/auth-context';
import { SuiteMark, Wordmark, GripMark } from './components/brand-wordmark';
import { BrandLogo } from './components/brand-logo';
import { HelpButton } from './components/help-drawer';

/**
 * The binder the plates live in. A chart binder's index is a ruled column of
 * tabs, so the rail is exactly that: no pills, no radii, no hover wash. The
 * current tab inverts to solid ink, the same state language every control in
 * the product uses.
 */

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function GarageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <rect x="2" y="10" width="20" height="11" />
      <path d="M3.5 10V6.4L12 2l8.5 4.4V10" />
      <line x1="6" y1="21" x2="6" y2="14" />
      <line x1="18" y1="21" x2="18" y2="14" />
    </svg>
  );
}

function RunsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <line x1="3" y1="20" x2="21" y2="20" />
      <line x1="3" y1="20" x2="3" y2="4" />
      <polyline points="4 17 9 11 13 14 20 6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <line x1="3" y1="7" x2="21" y2="7" />
      <line x1="3" y1="17" x2="21" y2="17" />
      <rect x="7.5" y="4.5" width="5" height="5" />
      <rect x="13" y="14.5" width="5" height="5" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
      <path d="M12 21.5C7 19 4.5 15.5 4.5 11V4.8L12 2.3l7.5 2.5V11c0 4.5-2.5 8-7.5 10.5z" />
      <polyline points="8.8 11.6 11.2 14 15.4 9.4" />
    </svg>
  );
}

const TABS = [
  { to: '/home', end: true, label: 'Home', icon: <HomeIcon /> },
  { to: '/garage', end: true, label: 'Garage', icon: <GarageIcon /> },
  { to: '/runs', end: false, label: 'Runs', icon: <RunsIcon /> },
  { to: '/grip', end: false, label: 'Grip', icon: <GripMark size={20} /> },
  { to: '/settings', end: false, label: 'Settings', icon: <SettingsIcon /> },
];

const railTab = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 no-underline transition-colors ${
    isActive ? 'bg-[var(--color-ink)] text-[var(--color-sheet)]' : 'hover:bg-[var(--color-sunk)]'
  }`;

const barTab = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-1 py-2 no-underline transition-colors ${
    isActive ? 'bg-[var(--color-ink)] text-[var(--color-sheet)]' : ''
  }`;

export function AppShell() {
  const { isAdmin } = useAuth();

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-sheet)' }}>
      <aside className="rule-r fixed inset-y-0 left-0 z-40 hidden w-56 flex-col overflow-y-auto lg:flex">
        <Link
          to="/home"
          className="rule-b flex items-center gap-2.5 px-3 py-4 no-underline"
          style={{ color: 'var(--color-ink)' }}
        >
          <SuiteMark size={22} />
          <Wordmark brand="suite" className="text-[0.9375rem]" />
        </Link>

        <nav className="flex flex-col" aria-label="Sections">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={railTab}>
              {t.icon}
              <span className="t-label" style={{ color: 'inherit' }}>
                {t.label}
              </span>
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/admin" className={railTab}>
              <AdminIcon />
              <span className="t-label" style={{ color: 'inherit' }}>
                Admin
              </span>
            </NavLink>
          )}
        </nav>

        <div className="rule-t mt-auto">
          <HelpButton
            className="flex w-full items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--color-sunk)]"
            labelled
          />
        </div>
      </aside>

      <header className="rule-b pt-safe sticky top-0 z-50 flex items-center gap-2.5 px-4 py-2.5 lg:hidden" style={{ background: 'var(--color-sheet)' }}>
        <Link to="/home" className="flex items-center gap-2 no-underline" style={{ color: 'var(--color-ink)' }}>
          <SuiteMark size={20} />
          <Wordmark brand="suite" className="text-sm" />
        </Link>
        <div className="ml-auto">
          <HelpButton />
        </div>
      </header>

      <main className="flex-1 px-4 pt-5 pb-24 lg:pl-[15.5rem] lg:pr-8 lg:pt-8 lg:pb-12">
        <div className="mx-auto w-full lg:max-w-6xl">
          <Outlet />
          <footer className="rule-t mt-12 flex flex-wrap items-center gap-x-5 gap-y-1 pt-3">
            <span className="t-annotation inline-flex items-center gap-1.5">
              <BrandLogo size={13} /> DynoRun
            </span>
            <span className="t-annotation inline-flex items-center gap-1.5">
              <GripMark size={13} /> Grip
            </span>
            <Link to="/privacy" className="t-annotation no-underline hover:underline">
              Privacy
            </Link>
            <Link to="/imprint" className="t-annotation no-underline hover:underline">
              Imprint
            </Link>
          </footer>
        </div>
      </main>

      <nav
        className="rule-t pb-safe fixed bottom-0 left-0 right-0 z-50 flex lg:hidden"
        style={{ background: 'var(--color-sheet)' }}
        aria-label="Sections"
      >
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={barTab}>
            {t.icon}
            <span
              style={{
                fontSize: 10,
                fontStretch: '75%',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {t.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
