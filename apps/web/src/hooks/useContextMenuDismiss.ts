import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { useClickOutside } from './useClickOutside';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface AdjustedContextMenu {
  x: number;
  y: number;
  maxHeight?: number;
}

const VIEWPORT_PADDING = 8;

/**
 * Bundles common context menu dismiss behaviors:
 * - Adjusts position to stay within viewport (before paint via useLayoutEffect)
 * - Constrains height when menu would exceed viewport
 * - Closes on click outside, Escape, and scroll
 *
 * Returns the viewport-adjusted position and optional maxHeight.
 */
export function useContextMenuDismiss(
  menuRef: RefObject<HTMLElement | null>,
  position: ContextMenuPosition,
  onClose: () => void,
): AdjustedContextMenu {
  const [adjusted, setAdjusted] = useState<AdjustedContextMenu>(position);

  // Adjust position so menu stays within viewport — runs before paint
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = position;
    let maxHeight: number | undefined;

    // Horizontal: prefer right, fall back left
    if (x + rect.width > vw) x = vw - rect.width - VIEWPORT_PADDING;
    if (x < VIEWPORT_PADDING) x = VIEWPORT_PADDING;

    // Vertical: prefer below click, fall back above, constrain if too tall
    if (y + rect.height > vh) {
      y = vh - rect.height - VIEWPORT_PADDING;
    }
    if (y < VIEWPORT_PADDING) {
      y = VIEWPORT_PADDING;
      // Menu is taller than available space — constrain height
      const available = vh - VIEWPORT_PADDING * 2;
      if (rect.height > available) {
        maxHeight = available;
      }
    }

    setAdjusted({ x, y, maxHeight });
  }, [position, menuRef]);

  useClickOutside(menuRef, onClose);

  // Close on Escape + scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = () => onClose();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  return adjusted;
}
