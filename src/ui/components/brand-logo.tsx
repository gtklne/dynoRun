interface BrandLogoProps {
  size?: number;
  /** 'default' = amber + zinc, 'mono' = single color via currentColor */
  variant?: 'default' | 'mono';
}

export function BrandLogo({ size = 28, variant = 'default' }: BrandLogoProps) {
  const isMono = variant === 'mono';
  const ringStroke = isMono ? 'currentColor' : '#27272a';
  const arcStroke = isMono ? 'currentColor' : '#f59e0b';
  const needleStroke = isMono ? 'currentColor' : '#f59e0b';
  const hubFill = isMono ? 'currentColor' : '#f59e0b';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="DynoRun"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer dial */}
      <circle cx="16" cy="16" r="13" stroke={ringStroke} strokeWidth="2" />
      {/* Sweep arc (from 7 o'clock around the top to 5 o'clock) */}
      <path
        d="M 7.6 22.4 A 12 12 0 1 1 24.4 22.4"
        stroke={arcStroke}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Tick marks at 0°, 90°, 180°, 270° */}
      <line x1="16" y1="4.5" x2="16" y2="7" stroke={arcStroke} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="27.5" y1="16" x2="25" y2="16" stroke={arcStroke} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4.5" y1="16" x2="7" y2="16" stroke={arcStroke} strokeWidth="1.5" strokeLinecap="round" />
      {/* Needle pointing to ~2 o'clock */}
      <line x1="16" y1="16" x2="22" y2="10" stroke={needleStroke} strokeWidth="2.5" strokeLinecap="round" />
      {/* Hub */}
      <circle cx="16" cy="16" r="2.2" fill={hubFill} />
    </svg>
  );
}
