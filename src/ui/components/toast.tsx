import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiErrors$ } from '@/api/client';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  variant?: ToastVariant;
  duration_ms?: number;
}

export interface ToastEntry {
  id: number;
  message: string;
  variant: ToastVariant;
  duration_ms: number;
}

interface ToastContextValue {
  show(message: string, opts?: ToastOptions): number;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 6000,
};

/**
 * A toast is a marginal note stuck to the sheet, so it is a ruled box carrying
 * the same square swatch an `Advisory` uses, not a panel with a coloured edge.
 * Only the variants that demand something spend colour; an error additionally
 * tints its ground and frame so it cannot be scanned past. There is no red on
 * this plate, so warning and error share caution ink and the ground separates
 * them.
 */
const SWATCH_BY_VARIANT: Record<ToastVariant, string> = {
  info: 'var(--color-terrain)',
  success: 'var(--color-gain)',
  warning: 'var(--color-caution)',
  error: 'var(--color-caution)',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, opts?: ToastOptions): number => {
      const variant = opts?.variant ?? 'info';
      const duration_ms = opts?.duration_ms ?? DEFAULT_DURATION[variant];
      const id = nextIdRef.current++;
      const entry: ToastEntry = { id, message, variant, duration_ms };
      setToasts((prev) => [entry, ...prev]);
      if (duration_ms > 0) {
        const timer = setTimeout(() => dismiss(id), duration_ms);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const unsub = apiErrors$.subscribe((err) => {
      const message = err instanceof Error ? err.message : String(err);
      show(message || 'Network error', { variant: 'error' });
    });
    return unsub;
  }, [show]);

  const value = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pb-safe pointer-events-none fixed bottom-16 left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-4 lg:left-auto lg:right-4 lg:w-96 lg:items-end lg:px-0"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="box pointer-events-auto flex w-full max-w-md items-start gap-3 px-3 py-2.5"
            style={
              t.variant === 'error'
                ? {
                    borderColor: 'var(--color-caution)',
                    background: 'var(--color-caution-tint)',
                  }
                : undefined
            }
          >
            <span
              aria-hidden="true"
              className="mt-1 h-3.5 w-3.5 shrink-0"
              style={{ background: SWATCH_BY_VARIANT[t.variant] }}
            />
            <p className="t-body m-0 flex-1 text-[0.8125rem] leading-6" style={{ color: 'var(--color-ink)' }}>
              {t.message}
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-1 p-1"
              style={{ color: 'var(--color-ink-3)' }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="square"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
