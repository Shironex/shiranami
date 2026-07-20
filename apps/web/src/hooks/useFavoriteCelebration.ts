import { useEffect, useRef, useState } from 'react';
import { useAnimationControls } from 'motion/react';
import { useDecorativeMotion } from '@/hooks/useDecorativeMotion';
import { SPRING_BOUNCE } from '@/lib/motion';

type AnimationControls = ReturnType<typeof useAnimationControls>;

export interface IFavoriteCelebration {
  /** Animation controls driving the heart pop; passed to the heart's `animate`. */
  readonly heartControls: AnimationControls;
  /** Burst counter — doubles as the ring's remount `key` so each burst replays. */
  readonly favoriteBurst: number;
  /** Whether the expanding ring renders (celebration enabled AND a burst fired). */
  readonly showFavoriteBurst: boolean;
}

/**
 * Drives the fresh-favorite celebration (heart pop + expanding burst ring)
 * shared by the player bar and the compact favorite button.
 *
 * Fires only on a genuine same-track favorite toggle (`false` → `true`). The
 * effect is scoped to `trackId`, so skipping onto an already-favorited track
 * never misfires the celebration. Gated behind {@link useDecorativeMotion}.
 */
export function useFavoriteCelebration(
  isFavorite: boolean,
  trackId: string | undefined
): IFavoriteCelebration {
  const celebrateEnabled = useDecorativeMotion();
  const heartControls = useAnimationControls();
  const prevFavorite = useRef(isFavorite);
  const prevTrackId = useRef(trackId);
  const [favoriteBurst, setFavoriteBurst] = useState(0);

  useEffect(() => {
    const trackChanged = trackId !== prevTrackId.current;
    prevTrackId.current = trackId;
    const became = isFavorite && !prevFavorite.current;
    prevFavorite.current = isFavorite;
    if (became && celebrateEnabled && !trackChanged) {
      void heartControls.start({ scale: [1, 1.3, 1], transition: SPRING_BOUNCE });
      setFavoriteBurst(b => b + 1);
    }
  }, [isFavorite, trackId, celebrateEnabled, heartControls]);

  return {
    heartControls,
    favoriteBurst,
    showFavoriteBurst: celebrateEnabled && favoriteBurst > 0,
  };
}
