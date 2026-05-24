import { NavLink, Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <NavLink to="/">Garage</NavLink>
        <NavLink to="/replay">Replay demo</NavLink>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
