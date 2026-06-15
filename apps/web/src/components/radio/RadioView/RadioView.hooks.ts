import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChangeEvent } from 'react';
import { Heart, Star } from 'lucide-react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useRadioStore, type RadioMode } from '@/stores/useRadioStore';
import { GENRE_PILLS, isoCodeToFlag, stationToTrack, titleCase } from '../radioUtils';
import { useRadioCatalog } from '../useRadioCatalog';
import { useLocaleCountry } from '../useLocaleCountry';
import { RADIO_SKELETON_ROWS } from '../StationRowSkeleton';
import type {
  IRadioActiveChip,
  IRadioGenrePill,
  IRadioModeTab,
  IRadioViewView,
} from './RadioView.types';

const LOW_RESULT_THRESHOLD = 10;
const SEARCH_DEBOUNCE_MS = 350;

const MODE_TABS: ReadonlyArray<{ id: RadioMode; labelKey: string; icon: IRadioModeTab['icon'] }> = [
  { id: 'browse', labelKey: 'topStations', icon: Star },
  { id: 'favorites', labelKey: 'favorites', icon: Heart },
];

export function useRadioView(): IRadioViewView {
  const { t } = useTranslation('radio');
  const { t: tCommon } = useTranslation('common');

  const stations = useRadioStore(s => s.stations);
  const favorites = useRadioStore(s => s.favorites);
  const isLoading = useRadioStore(s => s.isLoading);
  const isLoadingMore = useRadioStore(s => s.isLoadingMore);
  const error = useRadioStore(s => s.error);
  const filters = useRadioStore(s => s.filters);
  const mode = useRadioStore(s => s.mode);
  const hasMore = useRadioStore(s => s.hasMore);
  const runSearch = useRadioStore(s => s.runSearch);
  const loadMore = useRadioStore(s => s.loadMore);
  const loadTopStations = useRadioStore(s => s.loadTopStations);
  const loadFavorites = useRadioStore(s => s.loadFavorites);
  const toggleFavorite = useRadioStore(s => s.toggleFavorite);
  const setFilter = useRadioStore(s => s.setFilter);
  const clearFilters = useRadioStore(s => s.clearFilters);

  const catalog = useRadioCatalog();

  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasLoadedRef = useRef(false);
  const [searchDraft, setSearchDraft] = useState(filters.name ?? '');

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadTopStations();
    }
  }, [loadTopStations]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    setSearchDraft(filters.name ?? '');
  }, [filters.name]);

  const handleSearchChange = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setFilter({ name: value.trim() || undefined });
      }, SEARCH_DEBOUNCE_MS);
    },
    [setFilter]
  );

  const onSearchInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setSearchDraft(e.target.value);
      handleSearchChange(e.target.value);
    },
    [handleSearchChange]
  );

  const handleModeChange = useCallback(
    (next: RadioMode) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (next === 'favorites') loadFavorites();
      else loadTopStations();
    },
    [loadFavorites, loadTopStations]
  );

  const toggleGenrePill = useCallback(
    (genre: string) => {
      const current = filters.tagList ?? [];
      const next = current.includes(genre) ? current.filter(g => g !== genre) : [...current, genre];
      setFilter({ tagList: next.length > 0 ? next : undefined });
    },
    [filters.tagList, setFilter]
  );

  // "Near you" is a locale-country shortcut, not GPS proximity. Resolves from the
  // renderer locale, falling back to the OS region (main process) when needed.
  const localeCode = useLocaleCountry();
  const isLocalActive = Boolean(localeCode && filters.countryCode === localeCode);
  const onToggleLocal = useCallback(() => {
    if (!localeCode) return;
    setFilter({ countryCode: isLocalActive ? undefined : localeCode });
  }, [localeCode, isLocalActive, setFilter]);

  const radioTracks = useMemo(
    () => stations.map(s => stationToTrack(s, tCommon('liveRadio'))),
    [stations, tCommon]
  );

  const onPlayStation = useCallback(
    (index: number) => {
      setQueue(radioTracks, index);
    },
    [radioTracks, setQueue]
  );

  const isBrowse = mode === 'browse';

  const selectedCountryLabel = useMemo(() => {
    if (!filters.countryCode) return null;
    const match = catalog.countries.find(c => c.value === filters.countryCode);
    return match?.label ?? filters.countryCode;
  }, [filters.countryCode, catalog.countries]);

  const activeChips = useMemo<IRadioActiveChip[]>(() => {
    const makeRemoveLabel = (label: string): string => t('removeFilter', { name: label });
    const chips: IRadioActiveChip[] = [];
    if (filters.countryCode) {
      const label = selectedCountryLabel ?? filters.countryCode;
      chips.push({
        key: 'country',
        label,
        prefix: isoCodeToFlag(filters.countryCode),
        removeLabel: makeRemoveLabel(label),
        onRemove: () => setFilter({ countryCode: undefined }),
      });
    }
    if (filters.language) {
      const label = titleCase(filters.language);
      chips.push({
        key: 'language',
        label,
        removeLabel: makeRemoveLabel(label),
        onRemove: () => setFilter({ language: undefined }),
      });
    }
    for (const tag of filters.tagList ?? []) {
      const label = titleCase(tag);
      chips.push({
        key: `tag:${tag}`,
        label,
        removeLabel: makeRemoveLabel(label),
        onRemove: () =>
          setFilter({
            tagList: (filters.tagList ?? []).filter(g => g !== tag),
          }),
      });
    }
    return chips;
  }, [filters, selectedCountryLabel, setFilter, t]);

  const modeTabs = useMemo<IRadioModeTab[]>(
    () =>
      MODE_TABS.map(tab => ({
        id: tab.id,
        label: t(tab.labelKey),
        icon: tab.icon,
        isActive: mode === tab.id,
        onClick: () => handleModeChange(tab.id),
      })),
    [mode, t, handleModeChange]
  );

  const genrePills = useMemo<IRadioGenrePill[]>(
    () =>
      GENRE_PILLS.map(genre => ({
        genre,
        label: titleCase(genre),
        isActive: (filters.tagList ?? []).includes(genre),
        onClick: () => toggleGenrePill(genre),
      })),
    [filters.tagList, toggleGenrePill]
  );

  const showEmptyState = !isLoading && stations.length === 0 && !error;
  const hasFacetFilters = activeChips.length > 0 || Boolean(filters.name);
  const isLowResults =
    isBrowse &&
    !isLoading &&
    hasFacetFilters &&
    stations.length > 0 &&
    stations.length <= LOW_RESULT_THRESHOLD;

  const onClearAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    clearFilters();
  }, [clearFilters]);

  const onRetry = useCallback(() => {
    if (mode === 'favorites') loadFavorites();
    else runSearch();
  }, [mode, loadFavorites, runSearch]);

  const onLoadMore = useCallback(() => loadMore(), [loadMore]);

  return {
    t,
    stations,
    favorites,
    isLoading,
    isLoadingMore,
    error,
    catalog,
    countryCode: filters.countryCode ?? undefined,
    language: filters.language ?? undefined,
    searchDraft,
    modeTabs,
    genrePills,
    activeChips,
    showClearAll: activeChips.length >= 2,
    showFilterBar: isBrowse && (activeChips.length > 0 || stations.length > 0),
    showResultCount: stations.length > 0,
    resultCountLabel: t('resultCount', { count: stations.length }),
    hasLocaleCode: Boolean(localeCode),
    isLocalActive,
    showEmptyState,
    isFavoritesMode: mode === 'favorites',
    hasFacetFilters,
    isLowResults,
    showLoadMore: isBrowse && hasMore,
    currentTrackId: currentTrack?.id ?? null,
    isPlaying,
    skeletonRows: RADIO_SKELETON_ROWS,
    onSearchInputChange,
    onToggleLocal,
    onSelectCountry: value => setFilter({ countryCode: value ?? undefined }),
    onSelectLanguage: value => setFilter({ language: value ?? undefined }),
    onSelectTag: value => value && toggleGenrePill(value),
    onClearAll,
    onRetry,
    onLoadMore,
    onPlayStation,
    onToggleFavorite: toggleFavorite,
  };
}
