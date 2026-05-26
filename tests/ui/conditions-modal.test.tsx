import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConditionsModal } from '@/ui/run/conditions-modal';
import type { RunConditions } from '@/shared/types';

function renderModal(
  overrides: Partial<{
    open: boolean;
    initial: RunConditions;
    onClose: () => void;
    onSave: (next: RunConditions) => Promise<void> | void;
  }> = {},
) {
  const props = {
    open: true,
    initial: {} as RunConditions,
    onClose: vi.fn(),
    onSave: vi.fn(async () => {}),
    ...overrides,
  };
  const utils = render(<ConditionsModal {...props} />);
  return { ...utils, ...props };
}

describe('ConditionsModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    cleanup();
  });

  it('renders inputs with initial values when open', () => {
    renderModal({
      initial: {
        ambient_temp_c: 18,
        wind_kmh: -3,
        road_slope_pct: 0.5,
        surface: 'asphalt',
      },
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect((screen.getByLabelText(/Ambient temperature/i) as HTMLInputElement).value).toBe('18');
    expect((screen.getByLabelText(/Wind \(km\/h\)/i) as HTMLInputElement).value).toBe('-3');
    expect((screen.getByLabelText(/Road slope/i) as HTMLInputElement).value).toBe('0.5');
    expect((screen.getByLabelText(/Surface/i) as HTMLSelectElement).value).toBe('asphalt');
    cleanup();
  });

  it('saves only defined fields, omitting undefined keys', async () => {
    const onSave = vi.fn(async (_next: RunConditions) => {});
    renderModal({ onSave });

    fireEvent.change(screen.getByLabelText(/Ambient temperature/i), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const arg = onSave.mock.calls[0][0];
    expect(arg).toEqual({ ambient_temp_c: 20 });
    expect(Object.prototype.hasOwnProperty.call(arg, 'wind_kmh')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(arg, 'road_slope_pct')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(arg, 'surface')).toBe(false);
    cleanup();
  });

  it('clears surface back to undefined when "Not specified" selected', async () => {
    const onSave = vi.fn(async (_next: RunConditions) => {});
    renderModal({ initial: { surface: 'asphalt' }, onSave });

    fireEvent.change(screen.getByLabelText(/Surface/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave.mock.calls[0][0]).toEqual({});
    cleanup();
  });

  it('calls onClose when Cancel is clicked on a clean form', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('confirms before closing when form is dirty', () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderModal({ onClose });

    fireEvent.change(screen.getByLabelText(/Ambient temperature/i), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
    cleanup();
  });

  it('uses number inputs so non-numeric characters are not accepted by browsers', () => {
    renderModal();
    const temp = screen.getByLabelText(/Ambient temperature/i) as HTMLInputElement;
    const wind = screen.getByLabelText(/Wind \(km\/h\)/i) as HTMLInputElement;
    const slope = screen.getByLabelText(/Road slope/i) as HTMLInputElement;
    expect(temp.type).toBe('number');
    expect(wind.type).toBe('number');
    expect(slope.type).toBe('number');
    expect(temp.step).toBe('1');
    expect(wind.step).toBe('1');
    expect(slope.step).toBe('0.1');
    cleanup();
  });

  it('omits NaN values when input is non-numeric', async () => {
    const onSave = vi.fn(async (_next: RunConditions) => {});
    renderModal({ onSave });

    fireEvent.change(screen.getByLabelText(/Ambient temperature/i), {
      target: { value: 'abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    const arg = onSave.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(arg, 'ambient_temp_c')).toBe(false);
    cleanup();
  });

  it('shows an inline error when onSave throws', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('boom');
    });
    const onClose = vi.fn();
    renderModal({ onSave, onClose });

    fireEvent.change(screen.getByLabelText(/Ambient temperature/i), {
      target: { value: '15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('boom');
    });
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
  });

  it('closes after a successful save', async () => {
    const onSave = vi.fn(async () => {});
    const onClose = vi.fn();
    renderModal({ onSave, onClose });

    fireEvent.change(screen.getByLabelText(/Ambient temperature/i), {
      target: { value: '15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    cleanup();
  });
});
