import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ConditionsChips } from '@/ui/run/conditions-chips';
import type { RunConditions } from '@/shared/types';

afterEach(() => {
  cleanup();
});

describe('ConditionsChips', () => {
  it('returns null when no fields are set', () => {
    const empty: RunConditions = {};
    const { container } = render(<ConditionsChips conditions={empty} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one pill per defined field', () => {
    const c: RunConditions = {
      ambient_temp_c: 18,
      wind_kmh: 5,
      road_slope_pct: 0.5,
      surface: 'asphalt',
    };
    render(<ConditionsChips conditions={c} size="md" />);
    const wrapper = screen.getByTestId('conditions-chips');
    expect(wrapper.children.length).toBe(4);
    expect(wrapper.textContent).toContain('18°C');
    expect(wrapper.textContent).toContain('+5 km/h wind');
    expect(wrapper.textContent).toContain('+0.5% grade');
    expect(wrapper.textContent).toContain('Asphalt');
  });

  it('renders only defined fields', () => {
    const c: RunConditions = { ambient_temp_c: 12 };
    render(<ConditionsChips conditions={c} />);
    const wrapper = screen.getByTestId('conditions-chips');
    expect(wrapper.children.length).toBe(1);
    expect(wrapper.textContent).toContain('12°C');
  });

  it('preserves negative wind sign', () => {
    const c: RunConditions = { wind_kmh: -12 };
    render(<ConditionsChips conditions={c} size="md" />);
    expect(screen.getByTestId('conditions-chips').textContent).toContain('−12 km/h wind');
  });

  it('preserves positive wind sign', () => {
    const c: RunConditions = { wind_kmh: 5 };
    render(<ConditionsChips conditions={c} size="md" />);
    expect(screen.getByTestId('conditions-chips').textContent).toContain('+5 km/h wind');
  });

  it('uses shorter labels for sm size', () => {
    const c: RunConditions = { wind_kmh: 5, road_slope_pct: 0.5 };
    render(<ConditionsChips conditions={c} size="sm" />);
    const wrapper = screen.getByTestId('conditions-chips');
    expect(wrapper.textContent).toContain('+5 km/h');
    expect(wrapper.textContent).not.toContain('wind');
    expect(wrapper.textContent).toContain('+0.5%');
    expect(wrapper.textContent).not.toContain('grade');
  });

  it('applies distinct classNames for sm vs md size', () => {
    const c: RunConditions = { ambient_temp_c: 20 };
    const { unmount } = render(<ConditionsChips conditions={c} size="sm" />);
    const smPill = screen.getByTestId('conditions-chips').firstElementChild;
    expect(smPill?.className).toContain('text-[10px]');
    expect(smPill?.className).not.toContain('rounded-full');
    unmount();

    render(<ConditionsChips conditions={c} size="md" />);
    const mdPill = screen.getByTestId('conditions-chips').firstElementChild;
    expect(mdPill?.className).toContain('rounded-full');
    expect(mdPill?.className).not.toContain('text-[10px]');
  });
});
