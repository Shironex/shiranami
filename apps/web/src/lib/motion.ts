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

export const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 30 };
export const SPRING_GENTLE = { type: 'spring' as const, stiffness: 250, damping: 20 };
export const SPRING_BOUNCE = { type: 'spring' as const, stiffness: 300, damping: 25 };
