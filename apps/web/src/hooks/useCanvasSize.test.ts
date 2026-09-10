import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasSize } from './useCanvasSize';
import { triggerResize } from '@/test/setup';

describe('useCanvasSize', () => {
  let canvas: HTMLCanvasElement;
  let ref: { current: HTMLCanvasElement | null };

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    ref = { current: canvas };
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 48,
      top: 0,
      left: 0,
      right: 200,
      bottom: 48,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  });

  afterEach(() => {
    canvas.remove();
  });

  it('seeds dimensions and dpr synchronously from getBoundingClientRect', () => {
    const { result } = renderHook(() => useCanvasSize(ref));
    expect(result.current.widthRef.current).toBe(200);
    expect(result.current.heightRef.current).toBe(48);
    expect(result.current.dprRef.current).toBe(2);
  });

  it('updates refs when ResizeObserver fires', () => {
    const { result } = renderHook(() => useCanvasSize(ref));
    act(() => {
      triggerResize(canvas, { width: 320, height: 64 });
    });
    expect(result.current.widthRef.current).toBe(320);
    expect(result.current.heightRef.current).toBe(64);
  });

  it('updates dprRef when matchMedia change fires', () => {
    const listeners: Array<(e: MediaQueryListEvent) => void> = [];
    const mql = {
      matches: true,
      media: '',
      onchange: null,
      addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) =>
        listeners.push(cb)
      ),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mql);

    const { result } = renderHook(() => useCanvasSize(ref));
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    act(() => {
      listeners.forEach(cb => cb({} as MediaQueryListEvent));
    });
    expect(result.current.dprRef.current).toBe(3);
  });

  it('disconnects observer on unmount', () => {
    const { unmount, result } = renderHook(() => useCanvasSize(ref));
    unmount();
    act(() => {
      triggerResize(canvas, { width: 999, height: 999 });
    });
    expect(result.current.widthRef.current).not.toBe(999);
  });
});
