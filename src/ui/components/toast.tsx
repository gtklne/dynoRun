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
 * A toast is a marginal note stuck to the sheet: a filled plane carrying the
 * same square swatch an `Advisory` uses, not a panel with a coloured edge. The
 * three that carry a judgement take the traffic light and the ground with it,
 * so an error reads as red and a save as green; info carries no judgement and
 * stays in plain ink.
 */
const TONE_BY_VARIANT: Record<ToastVariant, 'ink-3' | 'go' | 'caution' | 'stop'> = {
  info: 'ink-3',
  success: 'go',
  warning: 'caution',
  error: 'stop',
};

const PLANE_BY_VARIANT: Partial<Record<ToastVariant, string>> = {
  success: 'var(--color-go-plane)',
  warning: 'var(--color-caution-plane)',
  error: 'var(--color-stop-plane)',
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
            className="plane-flat pointer-events-auto flex w-full max-w-md items-start gap-3 px-3 py-2.5"
            data-variant={t.variant}
            style={{ background: PLANE_BY_VARIANT[t.variant] }}
          >
            <span
              aria-hidden="true"
              className="mt-1 h-3.5 w-3.5 shrink-0"
              style={{ background: `var(--color-${TONE_BY_VARIANT[t.variant]})` }}
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
