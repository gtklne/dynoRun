import { useEffect, useState } from 'react';
import {
  SOCIAL_PROVIDERS,
  SOCIAL_PROVIDER_LABELS,
  type SocialProvider,
} from '@/auth/social-sign-in';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

/**
 * Provider marks drawn in one weight and in `currentColor`, like every other
 * symbol on the plate. Their brand palettes are deliberately dropped: on this
 * sheet hue is spent only where it changes a decision, and three logo colours
 * beside the ink would outshout the form they sit in.
 */
const ICONS: Record<SocialProvider, JSX.Element> = {
  google: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M16.4 12.8c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.7 0-1.9-.9-3.1-.8-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.7 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.6-1-2.6-3.8zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.5z" />
    </svg>
  ),
  discord: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18.3 18.3 0 0 1 4.3 1.4 15.6 15.6 0 0 0-11-1.4A19.8 19.8 0 0 0 3.7 4.4C.6 9 0 13.5.3 17.9a19.9 19.9 0 0 0 6 3 14.3 14.3 0 0 0 1.3-2.1 13 13 0 0 1-2-1c.2-.1.3-.2.5-.3a14.2 14.2 0 0 0 12.1 0l.5.3a13 13 0 0 1-2 1c.4.7.8 1.4 1.3 2.1a19.9 19.9 0 0 0 6-3c.4-5.1-.6-9.6-3.7-13.5zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
    </svg>
  ),
};

/**
 * Renders a button per provider the *server* reports as configured.
 *
 * The list is fetched rather than hardcoded because a provider whose
 * credentials are missing is not registered at all (see server/src/auth.ts), so
 * a hardcoded button would dead-end on an opaque OAuth error. Apple in
 * particular needs a paid developer account and can lag the other two by days.
 */
export function SocialButtons({
  onSelect,
  disabled,
  verb,
}: {
  onSelect: (provider: SocialProvider) => void;
  disabled?: boolean;
  verb: string;
}) {
  const [providers, setProviders] = useState<SocialProvider[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/auth-providers`)
      .then((res) => (res.ok ? res.json() : { providers: [] }))
      .then((body: { providers?: string[] }) => {
        if (cancelled) return;
        const known = (body.providers ?? []).filter(
          (p): p is SocialProvider => (SOCIAL_PROVIDERS as readonly string[]).includes(p),
        );
        setProviders(known);
      })
      .catch(() => {
        // A failed probe hides the buttons rather than showing broken ones.
        if (!cancelled) setProviders([]);
      });
    return () => { cancelled = true; };
  }, []);

  if (!providers || providers.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="rule-t h-px flex-1" />
        <span className="t-annotation">or</span>
        <span className="rule-t h-px flex-1" />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(provider)}
            className="ctl w-full"
          >
            {ICONS[provider]}
            {verb} with {SOCIAL_PROVIDER_LABELS[provider]}
          </button>
        ))}
      </div>
    </div>
  );
}
