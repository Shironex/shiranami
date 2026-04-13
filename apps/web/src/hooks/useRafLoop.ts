// Shared RAF loop hook gated by caller activity, page visibility, and element intersection.

import { useRef, useEffect, useState } from 'react';

export function useRafLoop(
  callback: () => void,
  elementRef: React.RefObject<HTMLElement | null>,
  isActive: boolean,
): void {
  const callbackRef = useRef(callback);
  const [isVisible, setIsVisible] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'visible',
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
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [elementRef.current]);

  // Run the RAF loop when all three signals are true.
  useEffect(() => {
    if (!isActive || !isVisible || !isIntersecting) return;

    let rafId: number;

    const loop = () => {
      callbackRef.current();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [isActive, isVisible, isIntersecting]);
}
