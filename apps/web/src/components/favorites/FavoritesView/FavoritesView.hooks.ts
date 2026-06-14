import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useMergedLibrary } from '@/hooks/useMergedLibrary';
import { useUIStore } from '@/stores/useUIStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { IFavoritesViewView } from './FavoritesView.types';

export function useFavoritesView(): IFavoritesViewView {
  const { t } = useTranslation('favorites');
  // Merged library so an in-session favorite toggle moves a track in or out
  // of the favorites filter immediately, without rewriting `library`.
  const library = useMergedLibrary();
  const libraryLoaded = useLibraryStore(s => s.libraryLoaded);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);
  const libraryHeroCardEnabled = useUIStore(s => s.libraryHeroCardEnabled);

  const favorites = useMemo(() => library.filter(track => track.isFavorite), [library]);

  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const handlePlayTrack = useCallback(
    (favIndex: number) => {
      setQueue(favoritesRef.current, favIndex);
    },
    [setQueue]
  );

  // Cold-start skeleton: library hasn't loaded yet, so we can't tell whether
  // any favorites exist. Show skeleton rather than an empty-state flash.
  const showSkeleton = !libraryLoaded && library.length === 0;

  return {
    t,
    showSkeleton,
    favorites,
    isEmpty: favorites.length === 0,
    libraryHeroCardEnabled,
    hasSelection,
    rowProps: {
      queue: favorites,
      currentTrack,
      isPlaying,
      handlePlayTrack,
      onToggleFavorite: toggleFavorite,
      showAddToPlaylist: true,
    },
  };
}
