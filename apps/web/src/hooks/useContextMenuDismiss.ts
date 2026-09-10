import { useEffect, useState, type RefObject } from 'react';
import { useClickOutside } from './useClickOutside';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

/**
 * Bundles common context menu dismiss behaviors:
 * - Adjusts position to stay within viewport
 * - Closes on click outside, Escape, and scroll
 *
 * Returns the viewport-adjusted position.
 */
export function useContextMenuDismiss(
  menuRef: RefObject<HTMLElement | null>,
  position: ContextMenuPosition,
  onClose: () => void
): ContextMenuPosition {
  const [adjusted, setAdjusted] = useState(position);

  // Adjust position so menu stays within viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;
    setAdjusted({ x, y });
  }, [position, menuRef]);

  useClickOutside(menuRef, onClose);

  // Close on Escape + scroll (ignore scrolls inside the menu itself)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose, menuRef]);

  return adjusted;
}
