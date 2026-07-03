import { type ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/ui/components/brand-logo';

// These pages are legally required to exist but shouldn't show up in search
// results — inject a noindex meta tag for the duration this page is mounted.
// robots.txt also disallows crawling them; the meta tag is the belt-and-braces
// signal for crawlers that see the page anyway (e.g. via a direct link).
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}

export function LegalPageLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  useNoIndex();
  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 lg:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-zinc-400 hover:text-amber-400 transition-colors"
          >
            ← Back
          </button>
          <BrandLogo size={22} />
        </div>
        <h1 className="text-2xl font-bold text-zinc-100">{title}</h1>
        <div className="space-y-5 text-sm leading-relaxed text-zinc-300 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h2]:pt-2 [&_a]:text-amber-400 [&_a]:hover:underline [&_p]:text-zinc-400 [&_li]:text-zinc-400">
          {children}
        </div>
        <p className="text-xs text-zinc-600 pt-4 border-t border-zinc-800">Last updated: {lastUpdated}</p>
      </div>
    </div>
  );
}
