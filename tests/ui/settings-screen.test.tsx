import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { SettingsScreen } from '@/ui/settings/settings-screen';

describe('SettingsScreen', () => {
  it('shows permission status and triggers export', async () => {
    const db = await createWebDatabase(':memory:');
    await runMigrations(db);

    // Stub the download mechanism so the test doesn't actually navigate.
    const createObjectURL = vi.fn().mockReturnValue('blob://dummy');
    const revokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURL;

    render(
      <DbContext.Provider value={db}>
        <MemoryRouter>
          <SettingsScreen />
        </MemoryRouter>
      </DbContext.Provider>,
    );

    expect(await screen.findByRole('heading', { name: /settings/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
  });
});
