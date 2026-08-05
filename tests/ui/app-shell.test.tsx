import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/auth/auth-context', () => ({
  useAuth: () => ({ isAdmin: false }),
}));

import { AppShell } from '@/ui/app-shell';

describe('AppShell', () => {
  it('keeps run history reachable from the mobile navigation', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'Runs' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Runs' })[1]).toHaveAttribute('href', '/runs');
  });
});
