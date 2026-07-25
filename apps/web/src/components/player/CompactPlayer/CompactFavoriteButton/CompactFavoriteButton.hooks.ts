import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrack } from '@/hooks/useTrack';
import { useFavoriteCelebration } from '@/hooks/useFavoriteCelebration';
import { cn, isRadioTrack } from '@/lib/utils';
import type { ICompactFavoriteButtonView } from './CompactFavoriteButton.types';

/**
 * Resolves the compact heart: its visibility gate (hidden for radio tracks and
 * while nothing plays), the overlay-merged favorite state, the celebration
 * animation handles, and the localized label/tooltip pair.
 */
export function useCompactFavoriteButton(): ICompactFavoriteButtonView {
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

  const trackId = currentTrack?.id;
  const onToggleFavorite = useCallback(() => {
    if (!trackId) return;
    toggleFavorite(trackId);
  }, [toggleFavorite, trackId]);

  return {
    visible: !!currentTrack && !isRadioTrack(currentTrack.filePath),
    heartControls,
    favoriteBurst,
    showFavoriteBurst,
    buttonLabel: isFavorite ? t('removeFromFavorites') : t('addToFavorites'),
    tooltipLabel: isFavorite ? t('unfavorite') : t('favorite'),
    buttonClassName: cn(
      'relative',
      isFavorite && 'text-favorite hover:bg-favorite/10 hover:text-favorite-hover'
    ),
    heartClassName: cn(isFavorite && 'fill-current'),
    onToggleFavorite,
  };
}
