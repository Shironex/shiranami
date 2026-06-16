import { usePanelResizeHandle } from './PanelResizeHandle.hooks';
import type { IPanelResizeHandleProps } from './PanelResizeHandle.types';

/**
 * Invisible-until-hovered vertical drag handle for resizable shell panels.
 * Pointer-based (works with mouse/touch/pen) with full keyboard support:
 * role="separator", arrow keys nudge, Home resets.
 */
export default function PanelResizeHandle(props: IPanelResizeHandleProps) {
  const { min, max, 'aria-label': ariaLabel, 'aria-controls': ariaControls, onReset } = props;
  const { valueNow, onPointerDown, onPointerMove, onPointerEnd, onKeyDown, className } =
    usePanelResizeHandle(props);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-controls={ariaControls}
      aria-valuenow={valueNow}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
}
