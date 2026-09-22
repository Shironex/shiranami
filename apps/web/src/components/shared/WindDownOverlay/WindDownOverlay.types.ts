/**
 * WindDownOverlay is a full-screen, non-interactive layer driven entirely by
 * the sleep-timer and wind-down stores, so its props surface is intentionally
 * empty — the shape keeps the per-component contract consistent.
 */
export interface IWindDownOverlayProps {}

export interface IWindDownOverlayView {
  /** Whether the overlay renders at all (dim ramp active or closing line up). */
  readonly visible: boolean;
  /** Current dim opacity (0 … max), already lifted to 0 during user activity. */
  readonly dimOpacity: number;
  /** The closing line while it lingers after the fade completes, else null. */
  readonly closingLine: string | null;
  /** Whether the closing line has eased in (drives its opacity transition). */
  readonly closingLineShown: boolean;
  /**
   * False under reduced-motion/low-performance: transitions are skipped and
   * the end-state dim is applied directly instead of ramping.
   */
  readonly animate: boolean;
}
