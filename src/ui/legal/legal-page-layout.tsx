import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandLogo } from '@/ui/components/brand-logo';

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
