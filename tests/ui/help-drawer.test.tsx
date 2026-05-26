import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HelpButton } from '@/ui/components/help-drawer';

describe('HelpButton + HelpDrawer', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('renders the help button', () => {
    render(<HelpButton />);
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });

  it('opens the drawer when the button is clicked', () => {
    render(<HelpButton />);
    expect(screen.queryByRole('dialog', { name: 'Help' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('dialog', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByText('What is DynoRun?')).toBeInTheDocument();
  });

  it('closes the drawer when Escape is pressed', () => {
    render(<HelpButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.transitionEnd(dialog.querySelector('aside') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Help' })).not.toBeInTheDocument();
  });

  it('closes the drawer when the backdrop is clicked', () => {
    render(<HelpButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
    fireEvent.transitionEnd(dialog.querySelector('aside') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Help' })).not.toBeInTheDocument();
  });
});
