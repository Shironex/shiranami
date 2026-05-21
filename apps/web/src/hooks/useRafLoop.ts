// Shared RAF loop hook gated by caller activity, page visibility, and element intersection.

import { useRef, useEffect, useState } from 'react';

export function useRafLoop(
  callback: () => void,
  elementRef: React.RefObject<HTMLElement | null>,
  isActive: boolean,
  fps?: number
): void {
  const callbackRef = useRef(callback);
  const [isVisible, setIsVisible] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'visible'
  );
  const [isIntersecting, setIsIntersecting] = useState(false);

  // Keep the callback ref fresh without restarting effects.
  useEffect(() => {
    callbackRef.current = callback;
  });

  // Track page visibility.
  useEffect(() => {
    const onChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // Track element intersection.
  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [elementRef.current]);

  // Run the RAF loop when all three signals are true.
  useEffect(() => {
    if (!isActive || !isVisible || !isIntersecting) return;

    // Optional frame-rate cap. We keep scheduling every frame (so the loop
    // stays aligned with the compositor and stops promptly on cleanup) but
    // only invoke the callback at most `fps` times/sec. Without this, the
    // callback runs at the display refresh rate — 120/144Hz monitors would
    // run expensive per-frame work ~2x more often than it needs to.
    const minInterval = fps && fps > 0 ? 1000 / fps : 0;
    let lastRun = -Infinity;
    let rafId: number;

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      if (now - lastRun < minInterval) return;
      lastRun = now;
      callbackRef.current();
    };

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [isActive, isVisible, isIntersecting, fps]);
}
