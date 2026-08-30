interface BrandLogoProps {
  size?: number;
  /** Kept for call-site compatibility; the mark is single-ink either way. */
  variant?: 'default' | 'mono';
}

/**
 * DynoRun's mark: the profile view it draws. A framed field, a baseline, and
 * one rising trace with its peak marked. Drawn in ink like every other symbol
 * on the plate, because a mark that shouts in its own colour competes with the
 * data it sits beside.
 */
export function BrandLogo({ size = 28 }: BrandLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="DynoRun"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flex: '0 0 auto' }}
    >
      <rect x="1.5" y="1.5" width="21" height="21" stroke="currentColor" strokeWidth="1.5" />
      <line x1="1.5" y1="18" x2="22.5" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <line x1="6" y1="1.5" x2="6" y2="22.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <path
        d="M2.5 18.6 C 7 18.2, 9.4 13.4, 12.6 8.9 C 14.6 6.1, 17.2 5.2, 21.5 6.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="16.1" cy="5.6" r="1.9" fill="currentColor" />
    </svg>
  );
}
