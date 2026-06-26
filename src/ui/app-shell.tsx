import { Link, NavLink, Outlet } from 'react-router-dom';
import { BrandLogo } from './components/brand-logo';
import { HelpButton } from './components/help-drawer';

function GarageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="10" width="22" height="12" rx="1"/>
      <path d="M3 10V6a1 1 0 0 1 .4-.8l8-5.3a1 1 0 0 1 1.2 0l8 5.3A1 1 0 0 1 21 6v4"/>
      <line x1="9" y1="22" x2="9" y2="16"/>
      <line x1="15" y1="22" x2="15" y2="16"/>
    </svg>
  );
}

function RunsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-1 py-2 px-4 flex-1 transition-colors ${
    isActive ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'
  }`;

export function AppShell() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Top header */}
      <header className="pt-safe sticky top-0 z-50 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800/60 px-4 py-3 flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <BrandLogo size={22} />
          <span className="font-bold text-lg tracking-tight">
            <span className="text-amber-400">dyno</span>
            <span className="text-zinc-100">Run</span>
          </span>
        </Link>
        <div className="ml-auto">
          <HelpButton />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 px-4 pt-4">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="pb-safe fixed bottom-0 left-0 right-0 bg-zinc-900/95 border-t border-zinc-800 backdrop-blur-sm flex z-50">
        <NavLink to="/" end className={navLinkClass}>
          <GarageIcon />
          <span className="text-[10px] font-medium">Garage</span>
        </NavLink>
        <NavLink to="/runs" className={navLinkClass}>
          <RunsIcon />
          <span className="text-[10px] font-medium">Runs</span>
        </NavLink>
        <NavLink to="/settings" className={navLinkClass}>
          <SettingsIcon />
          <span className="text-[10px] font-medium">Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
