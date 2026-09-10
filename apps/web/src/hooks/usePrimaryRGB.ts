// Shared hook for reading --primary-rgb from CSS. Exposes a ref so RAF draw
// loops can read the current tuple without triggering re-renders, and a
// versionRef that increments whenever the value changes so consumers can
// invalidate derived caches (e.g. CanvasGradient objects).

import { useRef, useEffect, type MutableRefObject } from 'react';

export interface UsePrimaryRGBResult {
  rgbRef: MutableRefObject<[number, number, number]>;
  versionRef: MutableRefObject<number>;
}

const FALLBACK: [number, number, number] = [155, 125, 235];

function parsePrimaryRGB(raw: string): [number, number, number] {
  const parts = raw.split(',').map(p => Number(p.trim()));
  if (parts.length === 3 && parts.every(n => !Number.isNaN(n))) {
    return parts as [number, number, number];
  }
  return FALLBACK;
}

function readFromDocument(): [number, number, number] {
  if (typeof document === 'undefined') return FALLBACK;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary-rgb').trim();
  if (!raw) return FALLBACK;
  return parsePrimaryRGB(raw);
}

export function usePrimaryRGB(): UsePrimaryRGBResult {
  // Read synchronously on first render so the very first RAF frame gets the
  // real color — avoids a one-frame flash of the fallback purple.
  const rgbRef = useRef<[number, number, number]>(readFromDocument());
  const versionRef = useRef(0);

  useEffect(() => {
    const update = () => {
      const next = readFromDocument();
      const [r, g, b] = rgbRef.current;
      if (next[0] !== r || next[1] !== g || next[2] !== b) {
        rgbRef.current = next;
        versionRef.current++;
      }
    };

    update();

    // Watch <html> for attribute changes so a future theme switcher (class
    // toggle, data-theme swap, or inline style setProperty) triggers a re-read.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  return { rgbRef, versionRef };
}
