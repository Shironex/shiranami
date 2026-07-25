import type { useAnimationControls } from 'motion/react';

type AnimationControls = ReturnType<typeof useAnimationControls>;

/** View model for the compact-mode favorite (heart) button. */
export interface ICompactFavoriteButtonView {
  /** Whether the control renders at all — a non-radio track must be playing. */
  readonly visible: boolean;
  /** Animation controls driving the heart pop; passed to the heart's `animate`. */
  readonly heartControls: AnimationControls;
  /** Burst counter — doubles as the ring's remount key so each burst replays. */
  readonly favoriteBurst: number;
  /** Whether the expanding burst ring renders. */
  readonly showFavoriteBurst: boolean;
  /** Localized `aria-label` for the heart button. */
  readonly buttonLabel: string;
  /** Localized tooltip copy for the heart button. */
  readonly tooltipLabel: string;
  /** Resolved class names for the heart button (favorited tint when on). */
  readonly buttonClassName: string;
  /** Resolved class names for the heart glyph (filled when favorited). */
  readonly heartClassName: string;
  /** Toggle the current track's favorite flag. */
  readonly onToggleFavorite: () => void;
}
