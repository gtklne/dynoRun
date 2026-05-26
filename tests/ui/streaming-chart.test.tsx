import { afterEach, describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, cleanup } from '@testing-library/react';
import { StreamingChart, type StreamingChartHandle } from '@/ui/components/streaming-chart';

const ORIGINAL_INNER_WIDTH = window.innerWidth;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
}

describe('StreamingChart', () => {
  afterEach(() => setViewportWidth(ORIGINAL_INNER_WIDTH));

  it('mounts without crashing', () => {
    const { container } = render(<StreamingChart />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });

  it('accepts pushSample and reset via ref', () => {
    const ref = createRef<StreamingChartHandle>();
    render(<StreamingChart ref={ref} />);
    expect(ref.current).not.toBeNull();
    ref.current?.pushSample(100, 25, 2000);
    ref.current?.pushSample(200, 30, 2400);
    ref.current?.reset();
    cleanup();
  });

  it('renders at a narrow mobile viewport without crashing', () => {
    setViewportWidth(360);
    const { container } = render(<StreamingChart />);
    expect(container.querySelector('div')).toBeInTheDocument();
    cleanup();
  });
});
