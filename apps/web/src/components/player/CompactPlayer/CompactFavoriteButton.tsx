import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrack } from '@/hooks/useTrack';
import { cn, isRadioTrack } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { IconButton } from '@/components/ui/icon-button';
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

  if (!currentTrack || isRadioTrack(currentTrack.filePath)) return null;

  return (
    <div className="flex items-center rounded-xl border border-border/20 bg-background/35 p-0.5 shadow-sm shadow-black/10">
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            onClick={() => toggleFavorite(currentTrack.id)}
            className={cn(
              isFavorite && 'text-favorite hover:bg-favorite/10 hover:text-favorite-hover'
            )}
            aria-label={isFavorite ? t('removeFromFavorites') : t('addToFavorites')}
          >
            <Heart className={cn(isFavorite && 'fill-current')} />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isFavorite ? t('unfavorite') : t('favorite')}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
