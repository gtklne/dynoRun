import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, copied: false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  private reload = (): void => {
    window.location.reload();
  };

  private copy = async (): Promise<void> => {
    const { error } = this.state;
    if (!error) return;
    const text = `${error.message}\n${error.stack ?? ''}`;
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // clipboard may be unavailable; silently noop
    }
  };

  override render(): ReactNode {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
          <h1 className="text-xl font-bold text-zinc-100">Something went wrong</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Try refreshing — your runs are safe in the cloud.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.reload}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-bold text-zinc-950 transition-colors hover:bg-amber-400 active:bg-amber-600"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.copy}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              {copied ? 'Copied' : 'Copy error details'}
            </button>
          </div>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-zinc-950 p-3 text-left text-[11px] leading-snug text-zinc-500">
            {error.message}
          </pre>
        </div>
      </div>
    );
  }
}
