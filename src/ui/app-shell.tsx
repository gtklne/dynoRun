import { NavLink, Outlet } from 'react-router-dom';
import { isNative } from '@/app/platform';

export function AppShell() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto', padding: 16 }}>
      {!isNative() && (
        <div style={{ background: '#fff8c4', border: '1px solid #e7d96a', padding: 8, marginBottom: 16, fontSize: 14 }}>
          Web preview: data is session-only and will be lost on reload. Use the native iOS or Android app for persistent storage.
        </div>
      )}
      <header style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <NavLink to="/">Garage</NavLink>
        <NavLink to="/replay">Replay demo</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
