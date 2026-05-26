import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DemoRunScreen } from '@/ui/demo/demo-run-screen';
import { UnitsProvider } from '@/app/units-context';

function renderDemo() {
  return render(
    <UnitsProvider>
      <MemoryRouter initialEntries={['/demo']}>
        <Routes>
          <Route path="/demo" element={<DemoRunScreen />} />
          <Route path="/login" element={<div>LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </UnitsProvider>,
  );
}

describe('DemoRunScreen', () => {
  afterEach(() => cleanup());

  it('renders the example banner', () => {
    renderDemo();
    expect(screen.getByText(/Example run/i)).toBeInTheDocument();
    expect(screen.getByText(/Sign in to record your own/i)).toBeInTheDocument();
  });

  it('shows a non-zero peak power value', () => {
    renderDemo();
    const peakLabels = screen.getAllByText(/Peak power$/i);
    expect(peakLabels.length).toBeGreaterThan(0);
    const peakTile = peakLabels[0].closest('div');
    expect(peakTile).not.toBeNull();
    const tileText = peakTile?.textContent ?? '';
    // Expect a number followed by the unit ('kW' is the default).
    expect(tileText).toMatch(/\d+(\.\d+)?\s*kW/);
    const numericMatch = tileText.match(/(\d+(?:\.\d+)?)\s*kW/);
    expect(numericMatch).not.toBeNull();
    if (numericMatch) {
      const value = parseFloat(numericMatch[1]);
      expect(value).toBeGreaterThan(0);
    }
  });

  it('renders the example vehicle label', () => {
    renderDemo();
    expect(screen.getByText(/Example Track Day Car/i)).toBeInTheDocument();
  });

  it('links to /login for sign-in', () => {
    renderDemo();
    const signInLink = screen.getAllByRole('link', { name: /Sign in/i });
    expect(signInLink.length).toBeGreaterThan(0);
    expect(signInLink[0]).toHaveAttribute('href', '/login');
  });
});
