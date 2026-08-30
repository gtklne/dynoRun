/**
 * The plate switch: day, night, or whatever the system asks for.
 *
 * A chart ships a night variant, so this is a real affordance of the world
 * rather than a bolted-on dark mode. `data-plate` on the root element is what
 * `src/index.css` and `readPlateInk` both key on, so setting it here flips the
 * DOM and every canvas together. "System" removes the attribute rather than
 * writing a value, which is what lets the `prefers-color-scheme` block win.
 */

export type PlatePreference = 'day' | 'night' | 'system';

export const PLATE_STORAGE_KEY = 'wasgoht.plate';

export function readPlatePreference(): PlatePreference {
  try {
    const raw = localStorage.getItem(PLATE_STORAGE_KEY);
    if (raw === 'day' || raw === 'night') return raw;
  } catch {
    // Private mode, or storage disabled. The system plate is the honest default.
  }
  return 'system';
}

export function applyPlatePreference(preference: PlatePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'system') {
    delete root.dataset.plate;
  } else {
    root.dataset.plate = preference;
  }
}

export function storePlatePreference(preference: PlatePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(PLATE_STORAGE_KEY);
    else localStorage.setItem(PLATE_STORAGE_KEY, preference);
  } catch {
    // A preference we cannot persist still applies for this session.
  }
  applyPlatePreference(preference);
}
