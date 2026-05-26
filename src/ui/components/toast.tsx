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

const BORDER_BY_VARIANT: Record<ToastVariant, string> = {
  info: 'border-l-zinc-700',
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  error: 'border-l-red-500',
};

const TEXT_BY_VARIANT: Record<ToastVariant, string> = {
  info: 'text-zinc-200',
  success: 'text-emerald-300',
  warning: 'text-amber-300',
  error: 'text-red-300',
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
        className="pb-safe pointer-events-none fixed bottom-16 left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border border-zinc-800 ${BORDER_BY_VARIANT[t.variant]} border-l-4 bg-zinc-900 px-3 py-2 shadow-lg`}
          >
            <p className={`flex-1 text-sm leading-snug ${TEXT_BY_VARIANT[t.variant]}`}>
              {t.message}
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-1 rounded p-1 text-zinc-500 hover:text-zinc-200"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
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
