import { NavLink, Outlet } from 'react-router-dom';
import { isNative } from '@/app/platform';

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

function ReplayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
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
      <header className="pt-safe bg-zinc-950 border-b border-zinc-800/60 px-4 py-3 flex items-center">
        <span className="text-amber-400 font-bold text-xl tracking-tight">dyno<span className="text-zinc-100">Run</span></span>
      </header>

      {/* Web-only session warning */}
      {!isNative() && (
        <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2 text-amber-300 text-xs">
          Web preview — data is session-only and will be lost on reload. Use the iOS or Android app for persistent storage.
        </div>
      )}

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
        <NavLink to="/replay" className={navLinkClass}>
          <ReplayIcon />
          <span className="text-[10px] font-medium">Replay</span>
        </NavLink>
        <NavLink to="/settings" className={navLinkClass}>
          <SettingsIcon />
          <span className="text-[10px] font-medium">Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
