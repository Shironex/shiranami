import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { IPanelResizeHandleProps, IPanelResizeHandleView } from './PanelResizeHandle.types';

const KEYBOARD_STEP = 16;

/**
 * Owns the pointer-drag + keyboard resize logic for the panel handle. Reads the
 * width through a ref during drag so the pointermove math always starts from the
 * width at drag start, not a stale render closure.
 */
export function usePanelResizeHandle({
  edge,
  value,
  min,
  max,
  onChange,
  onReset,
  onDraggingChange,
  className,
}: IPanelResizeHandleProps): IPanelResizeHandleView {
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragStart.current = { x: e.clientX, width: value };
      onDraggingChange?.(true);
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
    },
    [value, onDraggingChange]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = dragStart.current;
      if (!start) return;
      const delta = e.clientX - start.x;
      const next = edge === 'right' ? start.width + delta : start.width - delta;
      onChange(Math.min(max, Math.max(min, next)));
    },
    [edge, min, max, onChange]
  );

  const onPointerEnd = useCallback(() => {
    if (!dragStart.current) return;
    dragStart.current = null;
    onDraggingChange?.(false);
  }, [onDraggingChange]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number | null = null;
      if (e.key === 'ArrowLeft')
        next = edge === 'right' ? value - KEYBOARD_STEP : value + KEYBOARD_STEP;
      if (e.key === 'ArrowRight')
        next = edge === 'right' ? value + KEYBOARD_STEP : value - KEYBOARD_STEP;
      if (e.key === 'Home') {
        e.preventDefault();
        onReset();
        return;
      }
      if (next === null) return;
      e.preventDefault();
      onChange(Math.min(max, Math.max(min, next)));
    },
    [edge, value, min, max, onChange, onReset]
  );

  return {
    valueNow: Math.round(value),
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onKeyDown,
    className: cn(
      'absolute top-0 bottom-0 z-20 w-1.5 cursor-col-resize touch-none select-none',
      edge === 'right' ? '-right-0.75' : '-left-0.75',
      // Invisible by default; a subtle primary line appears on hover/focus/drag.
      'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-primary/0 after:transition-colors',
      'hover:after:bg-primary/40 focus-visible:after:bg-primary/60 active:after:bg-primary/60',
      'focus-visible:outline-none',
      className
    ),
  };
}
