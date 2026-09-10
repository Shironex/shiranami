import { useEffect, type RefObject } from 'react';

/**
 * Calls `onClickOutside` when a mousedown event occurs outside the referenced element.
 * Optionally delays listener attachment to avoid catching the triggering click.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClickOutside: () => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    };

    // Delay attachment so the click that opened the target doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [ref, onClickOutside, enabled]);
}
