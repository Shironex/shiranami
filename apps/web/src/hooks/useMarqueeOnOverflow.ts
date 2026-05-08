import { useEffect, useRef, useState } from 'react';

/**
 * Detects whether a single-line text node overflows its container and exposes
 * a ref + an `overflows` flag + a `shift` distance. The consumer sets the
 * shift as a CSS custom property (`--marquee-shift`) on the inner element so
 * the `--animate-marquee` keyframes can translate by exactly the offscreen
 * portion. Recomputes on resize and whenever `watch` changes (the text).
 *
 * Designed for compact-mode track titles where `truncate` is the default and
 * marquee is opt-in via :hover/:focus. The hook only reports geometry — the
 * consumer decides when to apply the animation utility.
 */
export function useMarqueeOnOverflow<T extends HTMLElement = HTMLElement>(
  watch: unknown
): {
  ref: React.RefObject<T | null>;
  overflows: boolean;
  /** Negative pixel offset to translate the inner element by during the shift phase. */
  shift: number;
} {
  const ref = useRef<T>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setShift(0);
      return;
    }
    const measure = () => {
      // scrollWidth includes the text width even when the parent clips with
      // overflow:hidden; clientWidth reports the visible box. A 1px slack
      // avoids subpixel rendering false-positives.
      const overflow = el.scrollWidth - el.clientWidth;
      setShift(overflow > 1 ? -overflow : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [watch]);

  return { ref, overflows: shift < 0, shift };
}
