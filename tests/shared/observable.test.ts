import { describe, it, expect, vi } from 'vitest';
import { Subject } from '@/shared/observable';

describe('Subject', () => {
  it('delivers values to subscribers', () => {
    const s = new Subject<number>();
    const spy = vi.fn();
    s.subscribe(spy);
    s.next(1);
    s.next(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 1);
    expect(spy).toHaveBeenNthCalledWith(2, 2);
  });

  it('unsubscribe stops delivery', () => {
    const s = new Subject<number>();
    const spy = vi.fn();
    const unsub = s.subscribe(spy);
    s.next(1);
    unsub();
    s.next(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('multiple subscribers receive same value', () => {
    const s = new Subject<number>();
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a);
    s.subscribe(b);
    s.next(42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });
});
