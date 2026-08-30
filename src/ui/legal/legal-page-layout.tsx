import { type ReactNode, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RevisionBar, TitleBlock } from '@/ui/plate';
import { SuiteMark, Wordmark } from '@/ui/components/brand-wordmark';

// These pages are legally required to exist but shouldn't show up in search
// results: inject a noindex meta tag for the duration this page is mounted.
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

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <line x1="20" y1="12" x2="4" y2="12" />
      <polyline points="10 6 4 12 10 18" />
    </svg>
  );
}

/**
 * A legal page is still a plate: a title block naming the sheet, one ruled body
 * column, and a revision bar stating which revision you are reading. The prose
 * inherits the plate's registers through the wrapper below rather than through
 * per-element classes, so the two documents cannot drift from each other.
 */
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
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-sheet)' }}>
      <header className="rule-b pt-safe flex items-center justify-between gap-4 px-4 py-3">
        <Link
          to="/hello"
          className="flex items-center gap-2.5 no-underline"
          style={{ color: 'var(--color-ink)' }}
          aria-label="wasgoht home"
        >
          <SuiteMark size={22} />
          <Wordmark brand="suite" className="text-[0.9375rem]" />
        </Link>
        <button type="button" onClick={() => navigate(-1)} className="ctl">
          <BackIcon />
          Back
        </button>
      </header>

      <main className="flex-1 px-4 py-8 lg:py-12">
        <div className="mx-auto w-full max-w-2xl">
          <TitleBlock
            ident="Legal"
            title={title}
            meta={[
              { label: 'Operator', value: 'Johannes Nothstein' },
              { label: 'Contact', value: 'privacy@wasgoht.ch' },
              { label: 'Revision', value: lastUpdated },
              { label: 'Indexing', value: 'noindex, nofollow' },
            ]}
          />

          <div className="t-body mt-8 [&_a]:underline [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-[0.75rem] [&_h2]:font-bold [&_h2]:tracking-[0.07em] [&_h2]:uppercase [&_h2]:text-[var(--color-ink)] [&_li]:mt-1.5 [&_p]:mt-4 [&_strong]:font-semibold [&_strong]:text-[var(--color-ink)] [&_ul]:mt-4">
            {children}
          </div>

          <div className="mt-10">
            <RevisionBar
              entries={[
                { label: 'Last updated', value: lastUpdated },
                { label: 'Applies to', value: 'wasgoht.ch' },
              ]}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
