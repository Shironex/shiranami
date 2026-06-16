import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface IPanelResizeHandleProps {
  /**
   * Which edge of the panel the handle sits on. Dragging away from the panel
   * grows it: a `right`-edge handle grows the panel when dragged right, a
   * `left`-edge handle grows it when dragged left.
   */
  readonly edge: 'left' | 'right';
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (width: number) => void;
  /** Double-click (or Home key) restores the default width. */
  readonly onReset: () => void;
  /** Fires on pointer drag start/end so the panel can suspend width transitions. */
  readonly onDraggingChange?: (dragging: boolean) => void;
  readonly 'aria-label': string;
  /** id of the panel element this separator resizes (a11y wiring). */
  readonly 'aria-controls'?: string;
  readonly className?: string;
}

export interface IPanelResizeHandleView {
  /** Rounded current width for `aria-valuenow`. */
  readonly valueNow: number;
  /** Begins a pointer drag (left button only) and captures the pointer. */
  readonly onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Applies the drag delta within [min, max] while dragging. */
  readonly onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Ends an in-progress drag (pointer up / cancel). */
  readonly onPointerEnd: () => void;
  /** Arrow keys nudge the width; Home resets to default. */
  readonly onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** Composed class string for the handle element. */
  readonly className: string;
}
