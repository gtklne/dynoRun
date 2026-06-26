import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VehicleForm } from '@/ui/garage/vehicle-form';
import type { NewVehicle } from '@/api/repositories/types';

function renderForm(initial?: Partial<NewVehicle>) {
  const onSubmit = vi.fn<(v: NewVehicle) => void>();
  const onCancel = vi.fn<() => void>();
  const utils = render(
    <VehicleForm initial={initial} onSubmit={onSubmit} onCancel={onCancel} />,
  );
  return { ...utils, onSubmit, onCancel };
}

describe('VehicleForm', () => {
  it('renders the optional details section collapsed by default for a new vehicle', () => {
    renderForm();
    const toggle = screen.getByRole('button', { name: /Details \(optional\)/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/^Make$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Model$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Year$/i)).not.toBeInTheDocument();
    cleanup();
  });

  it('expands the details panel when toggle is clicked', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Details \(optional\)/i }));
    expect(screen.getByLabelText(/^Make$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Model$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Year$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tires$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Transmission$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Factory power$/i)).toBeInTheDocument();
    cleanup();
  });

  it('auto-expands the details panel when editing a vehicle with enriched data', () => {
    renderForm({
      name: 'Golf R',
      kind: 'car',
      mass_kg: 1500,
      drivetrain: 'awd',
      frontal_area_m2: null,
      drag_coefficient: null,
      notes: '',
      make: 'VW',
      model: 'Golf R',
      year: 2020,
      tire_label: null,
      power_hp_factory: null,
      transmission: null,
    });
    const toggle = screen.getByRole('button', { name: /Details \(optional\)/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect((screen.getByLabelText(/^Make$/i) as HTMLInputElement).value).toBe('VW');
    expect((screen.getByLabelText(/^Model$/i) as HTMLInputElement).value).toBe('Golf R');
    expect((screen.getByLabelText(/^Year$/i) as HTMLInputElement).value).toBe('2020');
    cleanup();
  });

  it('keeps the details panel collapsed when editing a vehicle without enriched data', () => {
    renderForm({
      name: 'Old Civic',
      kind: 'car',
      mass_kg: 1300,
      drivetrain: 'fwd',
      frontal_area_m2: null,
      drag_coefficient: null,
      notes: '',
      make: null,
      model: null,
      year: null,
      tire_label: null,
      power_hp_factory: null,
      transmission: null,
    });
    const toggle = screen.getByRole('button', { name: /Details \(optional\)/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    cleanup();
  });

  it('rejects year 1800 and blocks submission with an error', () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: /Details \(optional\)/i }));

    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Civic' } });
    fireEvent.change(screen.getByLabelText(/^Mass \(kg\)$/i), { target: { value: '1300' } });
    fireEvent.change(screen.getByLabelText(/^Year$/i), { target: { value: '1800' } });

    fireEvent.click(screen.getByRole('button', { name: /Save vehicle/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Year must be 1900/i)).toBeInTheDocument();
    cleanup();
  });

  it('serializes empty optional strings to null on submit', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Civic' } });
    fireEvent.change(screen.getByLabelText(/^Mass \(kg\)$/i), { target: { value: '1300' } });

    fireEvent.click(screen.getByRole('button', { name: /Save vehicle/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.make).toBeNull();
    expect(arg.model).toBeNull();
    expect(arg.year).toBeNull();
    expect(arg.tire_label).toBeNull();
    expect(arg.power_hp_factory).toBeNull();
    expect(arg.transmission).toBeNull();
    cleanup();
  });

  it('defaults aero to null when no body shape is chosen', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Civic' } });
    fireEvent.change(screen.getByLabelText(/^Mass \(kg\)$/i), { target: { value: '1300' } });
    fireEvent.click(screen.getByRole('button', { name: /Save vehicle/i }));

    const arg = onSubmit.mock.calls[0][0];
    expect(arg.body_shape).toBeNull();
    expect(arg.drag_coefficient).toBeNull();
    expect(arg.frontal_area_m2).toBeNull();
    cleanup();
  });

  it('derives Cd + prefilled frontal area from the chosen body shape', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Civic' } });
    fireEvent.change(screen.getByLabelText(/^Mass \(kg\)$/i), { target: { value: '1300' } });
    fireEvent.change(screen.getByLabelText(/^Body shape/i), { target: { value: 'sedan' } });

    // Frontal area input appears and is prefilled with the preset.
    expect((screen.getByLabelText(/^Frontal area$/i) as HTMLInputElement).value).toBe('2.2');

    fireEvent.click(screen.getByRole('button', { name: /Save vehicle/i }));
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.body_shape).toBe('sedan');
    expect(arg.drag_coefficient).toBeCloseTo(0.30, 6);
    expect(arg.frontal_area_m2).toBeCloseTo(2.2, 6);
    cleanup();
  });

  it('keeps an edited frontal area while taking Cd from the shape', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Truck' } });
    fireEvent.change(screen.getByLabelText(/^Mass \(kg\)$/i), { target: { value: '2200' } });
    fireEvent.change(screen.getByLabelText(/^Body shape/i), { target: { value: 'suv' } });
    fireEvent.change(screen.getByLabelText(/^Frontal area$/i), { target: { value: '2.85' } });

    fireEvent.click(screen.getByRole('button', { name: /Save vehicle/i }));
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.body_shape).toBe('suv');
    expect(arg.drag_coefficient).toBeCloseTo(0.35, 6);
    expect(arg.frontal_area_m2).toBeCloseTo(2.85, 6);
    cleanup();
  });

  it('passes enriched values through on submit', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/^Name$/i), { target: { value: 'Golf' } });
    fireEvent.change(screen.getByLabelText(/^Mass \(kg\)$/i), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: /Details \(optional\)/i }));
    fireEvent.change(screen.getByLabelText(/^Make$/i), { target: { value: '  VW  ' } });
    fireEvent.change(screen.getByLabelText(/^Model$/i), { target: { value: 'Golf R' } });
    fireEvent.change(screen.getByLabelText(/^Year$/i), { target: { value: '2020' } });
    fireEvent.change(screen.getByLabelText(/^Tires$/i), { target: { value: 'Stock all-season' } });
    fireEvent.change(screen.getByLabelText(/^Transmission$/i), { target: { value: 'dct' } });
    fireEvent.change(screen.getByLabelText(/^Factory power$/i), { target: { value: '320' } });

    fireEvent.click(screen.getByRole('button', { name: /Save vehicle/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.make).toBe('VW');
    expect(arg.model).toBe('Golf R');
    expect(arg.year).toBe(2020);
    expect(arg.tire_label).toBe('Stock all-season');
    expect(arg.transmission).toBe('dct');
    expect(arg.power_hp_factory).toBe(320);
    cleanup();
  });
});
