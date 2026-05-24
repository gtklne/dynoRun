import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createWebDatabase } from '@/storage/database-web';
import { runMigrations } from '@/storage/migrations/runner';
import { DbContext } from '@/storage/db-context';
import { GarageScreen } from '@/ui/garage/garage-screen';

async function makeDb() {
  const db = await createWebDatabase(':memory:');
  await runMigrations(db);
  return db;
}

describe('GarageScreen', () => {
  it('shows empty state then lists added vehicle', async () => {
    const db = await makeDb();
    render(
      <DbContext.Provider value={db}>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<GarageScreen />} />
          </Routes>
        </MemoryRouter>
      </DbContext.Provider>,
    );

    expect(await screen.findByText(/no vehicles/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add vehicle/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Civic' } });
    fireEvent.change(screen.getByLabelText(/mass/i), { target: { value: '1300' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByText('Civic')).toBeInTheDocument());
  });
});
