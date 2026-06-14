// Shared canvas sizing hook. Tracks CSS dimensions via ResizeObserver and
// devicePixelRatio via matchMedia, exposing ref-based values so RAF draw
// loops can read them without re-rendering or calling getBoundingClientRect
// every frame.

import { useRef, useEffect, type RefObject, type MutableRefObject } from 'react';

export interface CanvasSize {
  widthRef: MutableRefObject<number>;
  heightRef: MutableRefObject<number>;
  dprRef: MutableRefObject<number>;
}

export function useCanvasSize(canvasRef: RefObject<HTMLCanvasElement | null>): CanvasSize {
  const widthRef = useRef(0);
  const heightRef = useRef(0);
  const dprRef = useRef(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Seed synchronously so the first RAF frame has valid dimensions.
    const rect = canvas.getBoundingClientRect();
    widthRef.current = rect.width;
    heightRef.current = rect.height;
    dprRef.current = window.devicePixelRatio || 1;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      widthRef.current = entry.contentRect.width;
      heightRef.current = entry.contentRect.height;
    });
    observer.observe(canvas);

    // Track DPR changes (monitor switch, zoom). matchMedia fires once when the
    // current resolution stops matching; we re-bind each time.
    let mql: MediaQueryList | null = null;
    const onDprChange = () => {
      dprRef.current = window.devicePixelRatio || 1;
      bind();
    };
    const bind = () => {
      if (mql) mql.removeEventListener('change', onDprChange);
      mql = window.matchMedia(`(resolution: ${dprRef.current}dppx)`);
      mql.addEventListener('change', onDprChange);
    };
    bind();

    return () => {
      observer.disconnect();
      if (mql) mql.removeEventListener('change', onDprChange);
    };
  }, [canvasRef]);

  return { widthRef, heightRef, dprRef };
}
