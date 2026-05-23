import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useRadioStore, type RadioMode } from '@/stores/useRadioStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Radio, Search, Heart, Globe, Languages, Tag, Loader2, Star, X } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { List } from 'react-window';
import { GENRE_PILLS, isoCodeToFlag, stationToTrack, titleCase } from './radioUtils';
import { FilterPopover } from './FilterPopover';
import { useRadioCatalog } from './useRadioCatalog';
import { StationRow } from './StationRow';
import { StationRowSkeleton, RADIO_SKELETON_ROWS } from './StationRowSkeleton';

const LOW_RESULT_THRESHOLD = 10;

const MODE_TABS: Array<{ id: RadioMode; labelKey: string; icon: typeof Radio }> = [
  { id: 'browse', labelKey: 'topStations', icon: Star },
  { id: 'favorites', labelKey: 'favorites', icon: Heart },
];

export function RadioView() {
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

  const handleSearchChange = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setFilter({ name: value.trim() || undefined });
      }, 350);
    },
    [setFilter]
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

  const radioTracks = useMemo(
    () => stations.map(s => stationToTrack(s, tCommon('liveRadio'))),
    [stations, tCommon]
  );

  const handlePlayStation = useCallback(
    (index: number) => {
      setQueue(radioTracks, index);
    },
    [radioTracks, setQueue]
  );

  const currentTrackId = currentTrack?.id ?? null;
  const isBrowse = mode === 'browse';

  const selectedCountryLabel = useMemo(() => {
    if (!filters.countryCode) return null;
    const match = catalog.countries.find(c => c.value === filters.countryCode);
    return match?.label ?? filters.countryCode;
  }, [filters.countryCode, catalog.countries]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; prefix?: string; onRemove: () => void }> = [];
    if (filters.countryCode) {
      chips.push({
        key: 'country',
        label: selectedCountryLabel ?? filters.countryCode,
        prefix: isoCodeToFlag(filters.countryCode),
        onRemove: () => setFilter({ countryCode: undefined }),
      });
    }
    if (filters.language) {
      chips.push({
        key: 'language',
        label: titleCase(filters.language),
        onRemove: () => setFilter({ language: undefined }),
      });
    }
    for (const tag of filters.tagList ?? []) {
      chips.push({
        key: `tag:${tag}`,
        label: titleCase(tag),
        onRemove: () =>
          setFilter({
            tagList: (filters.tagList ?? []).filter(g => g !== tag),
          }),
      });
    }
    return chips;
  }, [filters, selectedCountryLabel, setFilter]);

  const showEmptyState = !isLoading && stations.length === 0 && !error;
  const hasFacetFilters = activeChips.length > 0 || Boolean(filters.name);
  const isLowResults =
    isBrowse &&
    !isLoading &&
    hasFacetFilters &&
    stations.length > 0 &&
    stations.length <= LOW_RESULT_THRESHOLD;

  const handleClearAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    clearFilters();
  }, [clearFilters]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('pageTitle')} />

      <div className="px-6 pt-4 pb-3 shrink-0 space-y-3">
        {/* Search input */}
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/55 pointer-events-none" />
          <Input
            type="text"
            defaultValue={filters.name ?? ''}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className={cn(
              'h-auto w-full pl-10 pr-4 py-2.5 rounded-xl text-sm glass-subtle border-border/40',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus-visible:ring-primary/40 focus-visible:border-primary/40',
              'shadow-none'
            )}
          />
          {isLoading && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          )}
        </div>

        {/* Modes + filters */}
        <div className="flex flex-wrap items-center gap-2">
          {MODE_TABS.map(tab => {
            const isActive = mode === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleModeChange(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(tab.labelKey)}
              </button>
            );
          })}

          <span className="mx-1 h-5 w-px bg-border/40" aria-hidden="true" />

          <FilterPopover
            label={t('filterCountry')}
            placeholder={t('allCountries')}
            searchPlaceholder={t('searchCountriesPlaceholder')}
            emptyText={t('noCountriesFound')}
            options={catalog.countries}
            value={filters.countryCode ?? null}
            onSelect={value => setFilter({ countryCode: value ?? undefined })}
            icon={<Globe className="w-3.5 h-3.5 shrink-0 opacity-70" />}
            disabled={catalog.countries.length === 0}
          />
          <FilterPopover
            label={t('filterLanguage')}
            placeholder={t('allLanguages')}
            searchPlaceholder={t('searchLanguagesPlaceholder')}
            emptyText={t('noLanguagesFound')}
            options={catalog.languages}
            value={filters.language ?? null}
            onSelect={value => setFilter({ language: value ?? undefined })}
            icon={<Languages className="w-3.5 h-3.5 shrink-0 opacity-70" />}
            disabled={catalog.languages.length === 0}
          />
          <FilterPopover
            label={t('filterTag')}
            placeholder={t('allTags')}
            searchPlaceholder={t('searchTagsPlaceholder')}
            emptyText={t('noTagsFound')}
            options={catalog.tags}
            value={null}
            onSelect={value => value && toggleGenrePill(value)}
            icon={<Tag className="w-3.5 h-3.5 shrink-0 opacity-70" />}
            disabled={catalog.tags.length === 0}
          />
        </div>

        {/* Genre pills */}
        <div
          role="group"
          aria-label={t('filterTag')}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5"
        >
          {GENRE_PILLS.map(genre => {
            const isActive = (filters.tagList ?? []).includes(genre);
            return (
              <button
                key={genre}
                onClick={() => toggleGenrePill(genre)}
                aria-pressed={isActive}
                className={cn(
                  'shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'glass-subtle border border-border/30 text-muted-foreground hover:text-foreground'
                )}
              >
                {titleCase(genre)}
              </button>
            );
          })}
        </div>

        {/* Active filter chips + result count */}
        {isBrowse && (activeChips.length > 0 || stations.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {activeChips.map(chip => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary"
              >
                {chip.prefix && <span>{chip.prefix}</span>}
                {chip.label}
                <button
                  onClick={chip.onRemove}
                  aria-label={t('removeFilter', { name: chip.label })}
                  className="rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {activeChips.length >= 2 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                {t('clearFilters')}
              </button>
            )}
            {stations.length > 0 && (
              <span
                aria-live="polite"
                className="ml-auto text-xs text-muted-foreground/70 tabular-nums"
              >
                {t('resultCount', { count: stations.length })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Result region */}
      {error ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-lg flex flex-col items-center gap-6 px-10 py-14 text-center">
            <div className="relative">
              <div className="w-28 h-28 rounded-[28px] bg-destructive/8 border border-destructive/10 flex items-center justify-center">
                <img
                  src="./mascot.png"
                  alt=""
                  aria-hidden="true"
                  className="w-[4.5rem] h-[4.5rem] object-contain opacity-50"
                  draggable={false}
                />
              </div>
              <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
                <Radio className="w-4 h-4 text-destructive" />
              </div>
            </div>
            <div>
              <p className="font-display text-base font-semibold text-foreground/85">{error}</p>
            </div>
            <Button
              size="sm"
              onClick={() => (mode === 'favorites' ? loadFavorites() : runSearch())}
              className="rounded-xl px-4 py-2"
            >
              {t('retry', { ns: 'common' })}
            </Button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
          <div className="flex h-full flex-col gap-1 overflow-hidden px-2">
            {Array.from({ length: RADIO_SKELETON_ROWS }, (_, index) => (
              <StationRowSkeleton key={index} />
            ))}
          </div>
        </div>
      ) : showEmptyState ? (
        mode === 'favorites' ? (
          <ViewEmptyState
            title={t('noFavoriteStationsTitle')}
            subtitle={t('noFavoriteStationsSubtitle')}
            icon={Heart}
          />
        ) : hasFacetFilters ? (
          <ViewEmptyState
            title={t('noStationsFilteredTitle')}
            subtitle={t('noStationsFilteredSubtitle')}
            icon={Radio}
            action={{ label: t('clearFiltersAction'), onClick: handleClearAll }}
          />
        ) : (
          <ViewEmptyState
            title={t('noStationsTitle')}
            subtitle={t('noStationsSubtitle')}
            icon={Radio}
          />
        )
      ) : (
        <div className="flex-1 min-h-0 mx-4 mb-4 flex flex-col gap-2">
          {isLowResults && (
            <div
              role="status"
              className="shrink-0 glass-subtle border border-border/30 rounded-xl px-4 py-2.5 text-xs"
            >
              <p className="font-medium text-foreground/85">
                {t('lowResultsTitle', { count: stations.length })}
              </p>
              <p className="text-muted-foreground/70 mt-0.5">{t('lowResultsHint')}</p>
            </div>
          )}
          <div className="flex-1 min-h-0 rounded-2xl glass-panel border border-border/30 overflow-hidden">
            <div className="h-full px-2 py-1.5">
              <List
                rowCount={stations.length}
                rowHeight={56}
                overscanCount={10}
                className="scrollbar-thin"
                style={{ height: '100%' }}
                rowComponent={StationRow}
                rowProps={{
                  stations,
                  currentTrackId,
                  isPlaying,
                  favorites,
                  onPlay: handlePlayStation,
                  onToggleFavorite: toggleFavorite,
                }}
              />
            </div>
          </div>
          {isBrowse && hasMore && (
            <div className="shrink-0 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isLoadingMore}
                onClick={() => loadMore()}
                className="rounded-xl"
              >
                {isLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('loadMore')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RadioView;
