import {
  Radio,
  Search,
  Heart,
  Globe,
  Languages,
  Tag,
  Loader2,
  X,
  MapPin,
  BookText,
} from 'lucide-react';
import { List } from 'react-window';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { FilterPopover } from '../FilterPopover';
import { StationRow } from '../StationRow';
import { StationRowSkeleton } from '../StationRowSkeleton';
import { RadioDiary } from './RadioDiary';
import { useRadioView } from './RadioView.hooks';

export default function RadioView() {
  const {
    t,
    stations,
    favorites,
    isLoading,
    isLoadingMore,
    error,
    catalog,
    countryCode,
    language,
    searchDraft,
    modeTabs,
    genrePills,
    activeChips,
    showClearAll,
    showFilterBar,
    showResultCount,
    resultCountLabel,
    hasLocaleCode,
    isLocalActive,
    showEmptyState,
    isFavoritesMode,
    hasFacetFilters,
    isLowResults,
    showLoadMore,
    currentTrackId,
    isPlaying,
    skeletonRows,
    isDiaryOpen,
    diaryStationUuid,
    diaryStationName,
    onToggleDiary,
    onCloseDiary,
    onSearchInputChange,
    onToggleLocal,
    onSelectCountry,
    onSelectLanguage,
    onSelectTag,
    onClearAll,
    onRetry,
    onLoadMore,
    onPlayStation,
    onToggleFavorite,
  } = useRadioView();

  // Lift list/computation out of JSX render position into consts above the
  // return so the JSX below stays declarative.
  const modeTabElements = modeTabs.map(tab => {
    const Icon = tab.icon;
    return (
      <button
        key={tab.id}
        onClick={tab.onClick}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
          'focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary/40',
          tab.isActive
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <Icon className="w-3.5 h-3.5" />
        {tab.label}
      </button>
    );
  });

  const genrePillElements = genrePills.map(pill => (
    <button
      key={pill.genre}
      onClick={pill.onClick}
      aria-pressed={pill.isActive}
      className={cn(
        'shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
        pill.isActive
          ? 'bg-primary/15 text-primary'
          : 'glass-subtle border border-border/30 text-muted-foreground hover:text-foreground'
      )}
    >
      {pill.label}
    </button>
  ));

  const chipElements = showFilterBar
    ? activeChips.map(chip => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary"
        >
          {chip.prefix && <span>{chip.prefix}</span>}
          {chip.label}
          <button
            onClick={chip.onRemove}
            aria-label={chip.removeLabel}
            className="rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))
    : null;

  const skeletonElements = isLoading
    ? Array.from({ length: skeletonRows }, (_, index) => <StationRowSkeleton key={index} />)
    : null;

  let emptyStateCard;
  if (isFavoritesMode) {
    emptyStateCard = (
      <ViewEmptyState
        title={t('noFavoriteStationsTitle')}
        subtitle={t('noFavoriteStationsSubtitle')}
        icon={Heart}
      />
    );
  } else if (hasFacetFilters) {
    emptyStateCard = (
      <ViewEmptyState
        title={t('noStationsFilteredTitle')}
        subtitle={t('noStationsFilteredSubtitle')}
        icon={Radio}
        action={{ label: t('clearFiltersAction'), onClick: onClearAll }}
      />
    );
  } else {
    emptyStateCard = (
      <ViewEmptyState
        title={t('noStationsTitle')}
        subtitle={t('noStationsSubtitle')}
        icon={Radio}
      />
    );
  }

  let resultRegion;
  if (error) {
    resultRegion = (
      <div className="flex-1 min-h-0 flex">
        <ViewEmptyState
          variant="error"
          title={t('errorTitle')}
          subtitle={t('errorSubtitle')}
          icon={Radio}
          action={{ label: t('retry', { ns: 'common' }), onClick: onRetry }}
        />
      </div>
    );
  } else if (isLoading) {
    resultRegion = (
      <div className="flex-1 min-h-0 mx-4 mb-4 rounded-2xl glass-panel border border-border/30 overflow-hidden">
        <div className="flex h-full flex-col gap-1 overflow-hidden px-2">{skeletonElements}</div>
      </div>
    );
  } else if (showEmptyState) {
    // Wrap in a min-h-0 flex region so ViewEmptyState's `min-h-full` resolves
    // against the space left below the filter header (not the full view), keeping
    // the card centered in the content area instead of pushed toward the bottom.
    resultRegion = <div className="flex-1 min-h-0 flex">{emptyStateCard}</div>;
  } else {
    resultRegion = (
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
                onPlay: onPlayStation,
                onToggleFavorite,
              }}
            />
          </div>
        </div>
        {showLoadMore && (
          <div className="shrink-0 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoadingMore}
              onClick={onLoadMore}
              className="rounded-xl"
            >
              {isLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('loadMore')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const diaryPanel = isDiaryOpen ? (
    <RadioDiary
      stationUuid={diaryStationUuid}
      stationName={diaryStationName}
      onClose={onCloseDiary}
    />
  ) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('pageTitle')} />

      <div className="px-6 pt-4 pb-3 shrink-0 space-y-3">
        {/* Search input */}
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/55 pointer-events-none" />
          <Input
            type="text"
            value={searchDraft}
            onChange={onSearchInputChange}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
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
          {modeTabElements}

          <span className="mx-1 h-5 w-px bg-border/40" aria-hidden="true" />

          {hasLocaleCode && (
            <button
              onClick={onToggleLocal}
              aria-pressed={isLocalActive}
              title={t('filterLocalTooltip')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
                isLocalActive
                  ? 'bg-primary/15 text-primary'
                  : 'glass-subtle border border-border/40 text-muted-foreground hover:text-foreground'
              )}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0 opacity-70" />
              {t('filterLocal')}
            </button>
          )}

          <FilterPopover
            label={t('filterCountry')}
            placeholder={t('allCountries')}
            searchPlaceholder={t('searchCountriesPlaceholder')}
            emptyText={t('noCountriesFound')}
            options={catalog.countries}
            value={countryCode ?? null}
            onSelect={onSelectCountry}
            icon={<Globe className="w-3.5 h-3.5 shrink-0 opacity-70" />}
            disabled={catalog.countries.length === 0}
          />
          <FilterPopover
            label={t('filterLanguage')}
            placeholder={t('allLanguages')}
            searchPlaceholder={t('searchLanguagesPlaceholder')}
            emptyText={t('noLanguagesFound')}
            options={catalog.languages}
            value={language ?? null}
            onSelect={onSelectLanguage}
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
            onSelect={onSelectTag}
            icon={<Tag className="w-3.5 h-3.5 shrink-0 opacity-70" />}
            disabled={catalog.tags.length === 0}
          />

          <button
            onClick={onToggleDiary}
            aria-pressed={isDiaryOpen}
            title={t('diaryTooltip')}
            className={cn(
              'hidden lg:inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
              isDiaryOpen
                ? 'bg-primary/15 text-primary'
                : 'glass-subtle border border-border/40 text-muted-foreground hover:text-foreground'
            )}
          >
            <BookText className="w-3.5 h-3.5 shrink-0 opacity-70" />
            {t('diaryTitle')}
          </button>
        </div>

        {/* Genre pills */}
        <div
          role="group"
          aria-label={t('filterTag')}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin pb-0.5"
        >
          {genrePillElements}
        </div>

        {/* Active filter chips + result count */}
        {showFilterBar && (
          <div className="flex flex-wrap items-center gap-2">
            {chipElements}
            {showClearAll && (
              <button
                onClick={onClearAll}
                className="text-xs font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                {t('clearFilters')}
              </button>
            )}
            {showResultCount && (
              <span
                aria-live="polite"
                className="ml-auto text-xs text-muted-foreground/70 tabular-nums"
              >
                {resultCountLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Result region, with the diary alongside it when open. Beside the list
          rather than above it so the station list keeps its full height, and
          only from `lg` up — below that the list is the whole point of the
          view and there is no room to spare. */}
      <div className="flex-1 min-h-0 flex">
        {resultRegion}
        {diaryPanel}
      </div>
    </div>
  );
}
