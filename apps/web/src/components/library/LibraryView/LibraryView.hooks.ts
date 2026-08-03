import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { libraryKeys } from '@/hooks/queries/useLibrary';
import { IS_ELECTRON } from '@/lib/platform';
import { mapDbTracksToTracks } from '@/lib/trackMapper';
import type { Track } from '@/stores/types';
import type { ILibraryViewView } from './LibraryView.types';

/**
 * Past this many tracks, search routes through the FTS5 index (`db:tracks:
 * search`) instead of the in-memory substring filter. Small libraries keep the
 * client path: it is exact-substring, needs no debounce and no IPC round-trip,
 * and at this size a linear scan is already instant. The index buys ranking,
 * diacritic folding and flat latency as the library grows.
 */
const FTS_SEARCH_THRESHOLD = 2000;

/** Matches handed back per query — a virtual-list screenful many times over. */
const FTS_SEARCH_LIMIT = 1000;

/** Keystroke settle time before a query crosses the bridge. */
const FTS_SEARCH_DEBOUNCE_MS = 120;

/**
 * The filtered library backing the track list: the client substring filter
 * below the threshold, ranked FTS5 results above it. While an FTS response is
 * in flight the previous ranked list (or, first time, the client filter) keeps
 * the rows from flashing empty.
 */
function useSearchedLibrary(library: Track[], searchQuery: string): Track[] {
  const trimmed = searchQuery.trim();
  const ftsEligible = IS_ELECTRON && library.length > FTS_SEARCH_THRESHOLD;

  const [debouncedQuery, setDebouncedQuery] = useState(trimmed);
  useEffect(() => {
    if (!ftsEligible) return undefined;
    const timer = setTimeout(() => setDebouncedQuery(trimmed), FTS_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, ftsEligible]);

  const ftsResults = useQuery({
    // Under the `library` key prefix on purpose: a rescan invalidates
    // `libraryKeys.all`, and prefix invalidation refetches these too.
    queryKey: [...libraryKeys.all, 'search', debouncedQuery],
    queryFn: async () =>
      mapDbTracksToTracks(
        await window.electronAPI.db.tracks.search(debouncedQuery, FTS_SEARCH_LIMIT)
      ),
    enabled: ftsEligible && debouncedQuery.length > 0,
    placeholderData: keepPreviousData,
  });

  const clientFiltered = useMemo(() => {
    if (!trimmed) return library;
    const q = trimmed.toLowerCase();
    return library.filter(
      track =>
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q) ||
        track.album.toLowerCase().includes(q)
    );
  }, [library, trimmed]);

  if (!trimmed) return library;
  if (!ftsEligible) return clientFiltered;
  return ftsResults.data ?? clientFiltered;
}

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

  const filteredLibrary = useSearchedLibrary(library, searchQuery);

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
