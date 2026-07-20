import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrack } from '@/hooks/useTrack';
import { useFavoriteCelebration } from '@/hooks/useFavoriteCelebration';
import { cn, isRadioTrack } from '@/lib/utils';
import { SCALE_ICON } from '@/lib/motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MotionIconButton } from '@/components/ui/icon-button';
import { Heart } from 'lucide-react';
import { FavoriteBurst } from '../FavoriteBurst';

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

  // Same fresh-favorite celebration as the main player bar (heart pop +
  // expanding ring), scoped to the current track so skipping onto an
  // already-favorited track never misfires.
  const { heartControls, favoriteBurst, showFavoriteBurst } = useFavoriteCelebration(
    isFavorite,
    currentTrack?.id
  );

  if (!currentTrack || isRadioTrack(currentTrack.filePath)) return null;

  return (
    <div className="flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
      <Tooltip>
        <TooltipTrigger asChild>
          <MotionIconButton
            whileTap={SCALE_ICON}
            onClick={() => toggleFavorite(currentTrack.id)}
            className={cn(
              'relative',
              isFavorite && 'text-favorite hover:bg-favorite/10 hover:text-favorite-hover'
            )}
            aria-label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
          >
            {showFavoriteBurst && <FavoriteBurst burstKey={favoriteBurst} />}
            <motion.span animate={heartControls} className="inline-flex">
              <Heart className={cn(isFavorite && 'fill-current')} />
            </motion.span>
          </MotionIconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isFavorite ? t('unfavorite') : t('favorite')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
