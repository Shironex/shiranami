import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useAnimationControls } from 'motion/react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useTrack } from '@/hooks/useTrack';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn, isRadioTrack } from '@/lib/utils';
import { SCALE_ICON, SPRING_BOUNCE } from '@/lib/motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { iconButtonVariants } from '@/components/ui/icon-button';
import { Heart } from 'lucide-react';

/**
 * Compact-mode favorite button. Lives in the title bar so the user can heart
 * the current track without expanding the window. Hidden for radio tracks and
 * when nothing is playing. Shuffle/repeat are intentionally NOT here — they
 * already live in the main PlayerControls row below to avoid duplication.
 */
export function CompactFavoriteButton() {
  const { t } = useTranslation('player');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  // Heart state through the overlay so it stays in sync with the main
  // player bar and any other surface that toggled this track.
  const mergedTrack = useTrack(currentTrack?.id, currentTrack);
  const isFavorite = mergedTrack?.isFavorite ?? currentTrack?.isFavorite ?? false;

  // Same fresh-favorite celebration as the main player bar: heart pop +
  // expanding ring, gated behind reduced-motion and the low-performance mode.
  const reducedMotion = useReducedMotion();
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const celebrateFavorite = !reducedMotion && !lowPerformanceMode;
  const heartControls = useAnimationControls();
  const prevFavorite = useRef(isFavorite);
  const [favoriteBurst, setFavoriteBurst] = useState(0);

  useEffect(() => {
    const became = isFavorite && !prevFavorite.current;
    prevFavorite.current = isFavorite;
    if (became && celebrateFavorite) {
      void heartControls.start({ scale: [1, 1.3, 1], transition: SPRING_BOUNCE });
      setFavoriteBurst(b => b + 1);
    }
  }, [isFavorite, celebrateFavorite, heartControls]);

  if (!currentTrack || isRadioTrack(currentTrack.filePath)) return null;

  const showFavoriteBurst = celebrateFavorite && favoriteBurst > 0;

  return (
    <div className="flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            type="button"
            whileTap={SCALE_ICON}
            onClick={() => toggleFavorite(currentTrack.id)}
            className={cn(
              iconButtonVariants(),
              'relative',
              isFavorite && 'text-favorite hover:bg-favorite/10 hover:text-favorite-hover'
            )}
            aria-label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
          >
            {showFavoriteBurst && (
              <motion.span
                key={favoriteBurst}
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full bg-favorite/25"
                initial={{ scale: 0.5, opacity: 0.6 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            )}
            <motion.span animate={heartControls} className="inline-flex">
              <Heart className={cn(isFavorite && 'fill-current')} />
            </motion.span>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isFavorite ? t('unfavorite') : t('favorite')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
