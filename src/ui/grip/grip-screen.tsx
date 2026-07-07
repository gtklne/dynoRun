import { useEffect } from 'react';

// Grip Utilization is a self-contained static tool served at /grip-tool/ (edge-
// gated by the shared login via nginx auth_request). We host it full-bleed in an
// iframe inside the authed shell — no rewrite, works exactly as standalone.
export function GripScreen() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Grip Utilization — wasgoht';
    return () => { document.title = prev; };
  }, []);

  return (
    <iframe
      src="/grip-tool/"
      title="Grip Utilization"
      className="block h-full w-full border-0 bg-zinc-950"
    />
  );
}
