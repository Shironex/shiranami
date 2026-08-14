/**
 * Shared motion constants for consistent animations across the app.
 *
 * whileTap scale tokens:
 *   SCALE_ICON   (0.75) — small icon-only buttons (heart, remove, grip)
 *   SCALE_DISMISS(0.85) — close/dismiss icon buttons
 *   SCALE_BUTTON (0.9)  — regular text+icon action buttons
 *   SCALE_ACTION (0.92) — primary/prominent action buttons
 *   SCALE_CARD   (0.98) — card-like interactive surfaces
 *
 * Spring presets:
 *   SPRING_SNAPPY — fast response for UI switches and indicators
 *   SPRING_GENTLE — smooth content transitions (album art, text)
 *   SPRING_BOUNCE — playful entry for player bar, sidebar
 */

export const SCALE_ICON = { scale: 0.75 };
export const SCALE_DISMISS = { scale: 0.85 };
export const SCALE_BUTTON = { scale: 0.9 };
export const SCALE_ACTION = { scale: 0.92 };
export const SCALE_CARD = { scale: 0.98 };

/**
 * whileHover lift token for icon buttons — the subtle grow that pairs with the
 * SCALE_ICON tap. Kept as a named token so hover scales don't drift into magic
 * literals like the tap scales above.
 */
export const HOVER_ICON = { scale: 1.08 };

export const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };
export const SPRING_GENTLE = { type: 'spring' as const, stiffness: 250, damping: 20 };
export const SPRING_BOUNCE = { type: 'spring' as const, stiffness: 300, damping: 25 };

/**
 * Shared entry spring for list/card items — the single "signature" bounce the
 * app uses when content arrives. Slightly softer than SPRING_BOUNCE so long
 * lists settle calmly. Consumers should skip it under reduced motion.
 */
export const SPRING_ENTRY = { type: 'spring' as const, stiffness: 200, damping: 24 };

/**
 * Staggered list-entry variants. Put STAGGER_CONTAINER on the list wrapper
 * (initial="hidden" animate="visible") and STAGGER_ITEM on each child so items
 * cascade in instead of snapping as a block. Matches the cadence PlaylistsView
 * established (~0.04s between children). Gate the whole thing behind
 * useReducedMotion() — render the plain list when motion is reduced.
 */
export const STAGGER_CONTAINER = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const STAGGER_ITEM = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: SPRING_ENTRY },
};

/**
 * View-to-view transition for the main content region. Deliberately quick
 * (~0.16s) so a tool people leave open never feels sluggish. Use with
 * AnimatePresence mode="wait" keyed on the active view. Skip under reduced
 * motion (render the view without the wrapper).
 */
const EASE_OUT_SOFT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const VIEW_TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.16, ease: EASE_OUT_SOFT },
};

/**
 * Docked side-panel enter/exit — a gentle fade + short slide from the panel's
 * docked edge. Use with AnimatePresence around the mount site and negate the
 * offset when docked left; width stays static (the resize handle owns it) so
 * only the panel itself glides. Skip under reduced motion (render without the
 * motion props).
 */
export const PANEL_SLIDE_OFFSET = 24;
export const PANEL_TRANSITION = { duration: 0.18, ease: EASE_OUT_SOFT };
