import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { triggerResize } from '@/test/setup';

import SplashRain from './SplashRain';

// The rAF streak field is exercised by its own hook; here it is stubbed so the
// assertions cover exactly what this component owns — the canvas element, its
// device-pixel sizing, and the flags it forwards.
const field = vi.hoisted(() => ({
  calls: [] as { paused: boolean; lowPerformanceMode: boolean; reducedMotion: boolean }[],
}));

vi.mock('@/hooks/useSplashRain', () => ({
  useSplashRain: (
    _canvasRef: unknown,
    paused: boolean,
    lowPerformanceMode: boolean,
    reducedMotion: boolean
  ) => {
    field.calls.push({ paused, lowPerformanceMode, reducedMotion });
  },
}));

/** Recording stand-in for a 2D context — jsdom has no canvas implementation. */
function createFakeContext() {
  return { scale: vi.fn() };
}

const contextByCanvas = new WeakMap<HTMLCanvasElement, ReturnType<typeof createFakeContext>>();
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function contextFor(canvas: HTMLCanvasElement): ReturnType<typeof createFakeContext> {
  const ctx = contextByCanvas.get(canvas);
  if (!ctx) throw new Error('canvas never asked for a 2d context');
  return ctx;
}

/** jsdom exposes these as getter-only accessors, so redefine rather than assign. */
function setWindowMetric(name: 'innerWidth' | 'innerHeight' | 'devicePixelRatio', value: number) {
  Object.defineProperty(window, name, { configurable: true, writable: true, value });
}

function renderRain(
  props: Partial<{ paused: boolean; lowPerformanceMode: boolean; reducedMotion: boolean }> = {}
): HTMLCanvasElement {
  const { container } = render(
    <SplashRain
      paused={props.paused ?? false}
      lowPerformanceMode={props.lowPerformanceMode ?? false}
      reducedMotion={props.reducedMotion ?? false}
    />
  );
  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('rain canvas missing');
  return canvas;
}

beforeEach(() => {
  field.calls.length = 0;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    let ctx = contextByCanvas.get(this);
    if (!ctx) {
      ctx = createFakeContext();
      contextByCanvas.set(this, ctx);
    }
    return ctx;
  } as unknown as HTMLCanvasElement['getContext'];
  setWindowMetric('innerWidth', 1024);
  setWindowMetric('innerHeight', 768);
  setWindowMetric('devicePixelRatio', 1);
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe('SplashRain', () => {
  it('renders a full-bleed decorative canvas that never intercepts clicks', () => {
    const canvas = renderRain();

    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
    // CSS-scaled to fill the overlay regardless of its device-pixel backing size.
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
  });

  it('sizes the backing store to the window in CSS pixels at dpr 1', () => {
    const canvas = renderRain();

    expect(canvas.width).toBe(window.innerWidth);
    expect(canvas.height).toBe(window.innerHeight);
    expect(contextFor(canvas).scale).toHaveBeenCalledWith(1, 1);
  });

  it('sizes the backing store in device pixels and rescales on HiDPI', () => {
    setWindowMetric('devicePixelRatio', 2);

    const canvas = renderRain();

    // Device pixels in, CSS pixels out — otherwise streaks paint at 2x scale.
    expect(canvas.width).toBe(window.innerWidth * 2);
    expect(canvas.height).toBe(window.innerHeight * 2);
    expect(contextFor(canvas).scale).toHaveBeenCalledWith(2, 2);
  });

  it('resizes the canvas when the document element resizes', () => {
    const canvas = renderRain();
    const initialWidth = canvas.width;

    setWindowMetric('innerWidth', initialWidth + 400);
    triggerResize(document.documentElement, { width: window.innerWidth, height: 768 });

    expect(canvas.width).toBe(initialWidth + 400);
    // Every resize re-applies the transform, so the scale is re-asserted.
    expect(contextFor(canvas).scale).toHaveBeenCalledTimes(2);
  });

  it('forwards the freeze flags to the rAF field', () => {
    renderRain({ paused: true, lowPerformanceMode: false, reducedMotion: true });

    expect(field.calls.at(-1)).toEqual({
      paused: true,
      lowPerformanceMode: false,
      reducedMotion: true,
    });
  });
});
