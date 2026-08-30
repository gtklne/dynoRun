import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'outline' | 'solid' | 'procedure';

/**
 * Controls are ruled plates. The active state inverts to solid ink rather than
 * changing hue, so it survives sunlight, gloves and a colour-blind reader; the
 * `major` size exists for the trackside actions a rider hits without looking.
 */
export function PlateButton({
  variant = 'outline',
  major = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; major?: boolean }) {
  return (
    <button
      type="button"
      className={`ctl ${variantClass(variant)} ${major ? 'ctl-major' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function PlateLink({
  to,
  variant = 'outline',
  major = false,
  className = '',
  style,
  children,
}: {
  to: string;
  variant?: Variant;
  major?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      style={style}
      className={`ctl no-underline ${variantClass(variant)} ${major ? 'ctl-major' : ''} ${className}`}
    >
      {children}
    </Link>
  );
}

/** Plain anchor variant: the landing page is prerendered without a Router. */
export function PlateAnchor({
  href,
  variant = 'outline',
  major = false,
  className = '',
  style,
  children,
}: {
  href: string;
  variant?: Variant;
  major?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      style={style}
      className={`ctl no-underline ${variantClass(variant)} ${major ? 'ctl-major' : ''} ${className}`}
    >
      {children}
    </a>
  );
}

function variantClass(v: Variant) {
  if (v === 'solid') return 'ctl-solid';
  if (v === 'procedure') return 'ctl-procedure';
  return '';
}

/**
 * A boxed segmented strip: one frame, hairline dividers, the selected cell
 * inverted to solid. Replaces every ad-hoc tab row and toggle group, so a lap
 * selector and a units switch read as the same instrument control.
 */
export function PlateSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex box-frame ${className}`}
      style={{ isolation: 'isolate' }}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-active={value === o.value}
          onClick={() => onChange(o.value)}
          className={`ctl border-0 ${i > 0 ? 'rule-l' : ''}`}
          style={{ minHeight: 40 }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A labelled field. The label is always present and always in the annotation
 * register: a placeholder-only field loses its name the moment it is filled.
 */
export function PlateField({
  label,
  hint,
  error,
  id,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="t-annotation block mb-1.5">
        {label}
      </label>
      {children}
      {error ? (
        <p className="t-annotation mt-1.5" style={{ color: 'var(--color-caution)' }}>
          {error}
        </p>
      ) : (
        hint && <p className="t-annotation mt-1.5">{hint}</p>
      )}
    </div>
  );
}

/**
 * A bounded reading against its limit: GPS lock, a stability window, a hold
 * countdown. Three screens hand-rolled this, which is the duplication the
 * plate system exists to prevent.
 *
 * `blocked` is not the same as "not yet full": it means the reading cannot
 * complete as things stand (too slow to calibrate, accuracy too poor), and the
 * caller must say so in words beside it. A bar that fills and then sits there
 * with no explanation is the exact failure CLAUDE.md records for the stationary
 * calibration case.
 */
export function PlateGauge({
  label,
  value,
  max,
  unit,
  reached = false,
  blocked = false,
  major = false,
  note,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  reached?: boolean;
  blocked?: boolean;
  major?: boolean;
  note?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="t-annotation">{label}</span>
        <span className="t-data text-sm">
          {Number.isFinite(value) ? value.toFixed(value < 10 ? 1 : 0) : <span className="na">n/a</span>}
          {unit && <span className="t-annotation ml-1">{unit}</span>}
        </span>
      </div>
      <div
        className={`gauge ${major ? 'gauge-major' : ''}`}
        data-reached={reached || undefined}
        data-blocked={blocked || undefined}
        role="progressbar"
        aria-label={label}
        aria-valuenow={Number.isFinite(value) ? value : undefined}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <span className="gauge-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
      {note && (
        <p className="t-annotation mt-1.5" style={blocked ? { color: 'var(--color-caution)' } : undefined}>
          {note}
        </p>
      )}
    </div>
  );
}
