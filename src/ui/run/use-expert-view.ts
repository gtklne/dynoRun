import { useEffect, useState } from 'react';

const EXPERT_VIEW_KEY = 'dynorun:expertView';

function readInitial(): boolean {
  try {
    return localStorage.getItem(EXPERT_VIEW_KEY) === 'true';
  } catch {
    return false;
  }
}

// Sticky "expert view" preference, shared by the run-details screen and Replay
// Lab so toggling one reflects in the other. Persisted to localStorage; defaults
// off, and degrades gracefully where storage is unavailable (private mode).
export function useExpertView(): [boolean, (next: boolean) => void] {
  const [expert, setExpert] = useState<boolean>(readInitial);

  useEffect(() => {
    try {
      localStorage.setItem(EXPERT_VIEW_KEY, String(expert));
    } catch {
      /* noop */
    }
  }, [expert]);

  return [expert, setExpert];
}
