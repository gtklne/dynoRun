import { describe, it, expect } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '@/ui/components/toast';
import { apiErrors$, ApiError } from '@/api/client';

function Trigger({ message, variant }: { message: string; variant?: 'info' | 'success' | 'warning' | 'error' }) {
  const toast = useToast();
  return (
    <button onClick={() => toast.show(message, variant ? { variant } : undefined)}>
      fire
    </button>
  );
}

describe('Toast', () => {
  it('shows a toast when useToast().show() is invoked', () => {
    render(
      <ToastProvider>
        <Trigger message="Hello there" />
      </ToastProvider>,
    );
    expect(screen.queryByText('Hello there')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    cleanup();
  });

  it('dismisses when the close button is clicked', () => {
    render(
      <ToastProvider>
        <Trigger message="Bye" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByText('Bye')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByText('Bye')).not.toBeInTheDocument();
    cleanup();
  });

  it('renders an error variant for apiErrors$ broadcasts', () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    act(() => {
      apiErrors$.next(new ApiError(500, 'server boom'));
    });
    expect(screen.getByText('server boom')).toBeInTheDocument();
    cleanup();
  });
});
