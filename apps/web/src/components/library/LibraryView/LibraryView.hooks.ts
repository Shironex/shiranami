import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { ILibraryViewView } from './LibraryView.types';

export function useLibraryView(): ILibraryViewView {
  const { t } = useTranslation('library');
  const library = useLibraryStore(s => s.library);
  const libraryLoaded = useLibraryStore(s => s.libraryLoaded);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const hasSelection = useSelectionStore(s => s.selectedTrackIds.size > 0);

  const viewMode = useUIStore(s => s.libraryViewMode);
  const setLibraryViewMode = useUIStore(s => s.setLibraryViewMode);
  const selectedAlbumKey = useViewStore(s => s.selectedAlbumKey);
  const heroCardEnabled = useUIStore(s => s.libraryHeroCardEnabled);
  const albumGridSize = useUIStore(s => s.albumGridSize);
  const setAlbumGridSize = useUIStore(s => s.setAlbumGridSize);
  const albumSortMode = useUIStore(s => s.albumSortMode);
  const setAlbumSortMode = useUIStore(s => s.setAlbumSortMode);
  const albumSortOrder = useUIStore(s => s.albumSortOrder);
  const setAlbumSortOrder = useUIStore(s => s.setAlbumSortOrder);

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredLibrary = useMemo(() => {
    if (!searchQuery.trim()) return library;
    const q = searchQuery.toLowerCase();
    return library.filter(
      track =>
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q) ||
        track.album.toLowerCase().includes(q)
    );
  }, [library, searchQuery]);

  const filteredRef = useRef(filteredLibrary);
  filteredRef.current = filteredLibrary;

  const handlePlayTrack = useCallback(
    (index: number) => {
      setQueue(filteredRef.current, index);
    },
    [setQueue]
  );

  // Ctrl+F / Cmd+F focuses the search input.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  const isFiltered = searchQuery.trim().length > 0;
  const isAlbumsMode = viewMode === 'albums';
  const isTracksMode = viewMode === 'tracks';

  return {
    t,
    // Cold-start skeleton: the initial library query is still in flight and we
    // have no cached tracks yet. Don't flash the empty-state hero.
    showSkeleton: !libraryLoaded && library.length === 0,
    showAlbumDetail: isAlbumsMode && Boolean(selectedAlbumKey),
    library,
    filteredLibrary,
    viewMode,
    heroCardEnabled,
    hasSelection,
    searchInputRef,
    searchQuery,
    searchPlaceholder: isAlbumsMode ? t('filterAlbumsPlaceholder') : t('filterPlaceholder'),
    isFiltered,
    isAlbumsMode,
    isTracksMode,
    isLibraryEmpty: library.length === 0,
    hasNoMatches: filteredLibrary.length === 0,
    showTrackFilterCount: isFiltered && isTracksMode,
    trackFilterCountLabel: t('filterCount', {
      filtered: filteredLibrary.length,
      total: library.length,
    }),
    rowProps: {
      queue: filteredLibrary,
      currentTrack,
      isPlaying,
      handlePlayTrack,
      onToggleFavorite: toggleFavorite,
      showAddToPlaylist: true,
    },
    albumGridSize,
    albumSortMode,
    albumSortOrder,
    albumSortLabels: {
      button: t('sortBy'),
      modeName: t('sortByName'),
      modeArtist: t('sortByArtist'),
      modeYear: t('sortByYear'),
      modeRecentlyAdded: t('sortByRecentlyAdded'),
      orderAsc: t('sortOrderAsc'),
      orderDesc: t('sortOrderDesc'),
    },
    gridSizeLabels: {
      group: t('gridSize'),
      small: t('gridSizeSmall'),
      medium: t('gridSizeMedium'),
      large: t('gridSizeLarge'),
    },
    onViewModeChange: setLibraryViewMode,
    onSearchChange: setSearchQuery,
    onClearSearch: () => setSearchQuery(''),
    onAlbumGridSizeChange: setAlbumGridSize,
    onAlbumSortModeChange: setAlbumSortMode,
    onAlbumSortOrderChange: setAlbumSortOrder,
    onKeyDown,
  };
}
