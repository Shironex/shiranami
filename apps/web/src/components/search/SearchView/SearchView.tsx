import { Search, Loader2, X, Keyboard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SearchStateCard } from '../SearchStateCard';
import { SearchSuggestions } from '../SearchSuggestions';
import { SearchingCard, SearchErrorCard } from '../SearchStatusCards';
import { DependencyInstallCard } from '../DependencyInstallCard';
import { SearchResultRow } from '../SearchResultRow';
import { useSearchView } from './SearchView.hooks';

export default function SearchView() {
  const {
    t,
    inputRef,
    query,
    setQuery,
    results,
    isSearching,
    searchError,
    onInputKeyDown,
    onClearQuery,
    onInputFocus,
    onInputBlur,
    getDownloadState,
    onDownload,
    onPreview,
    previewLoadingId,
    isPreviewPlaying,
    dependencyState,
    dependenciesSnapshot,
    dependencyInstallStatus,
    dependencyInstallError,
    isDependencyInstallInProgress,
    dependencyInstallProgress,
    dependencyInstallLabel,
    dependencyInstallTarget,
    onInstallDependencies,
    suggestions,
    highlightedIndex,
    setHighlightedIndex,
    suggestionsOpen,
    onSelectSuggestion,
    showCenteredSearchState,
  } = useSearchView();

  if (dependencyState === 'checking') {
    return <SearchStateCard title={t('preparing')} description={t('preparingDesc')} loading />;
  }

  if (dependencyState === 'needs-install') {
    return (
      <DependencyInstallCard
        ffmpegInstalled={dependenciesSnapshot?.ffmpegInstalled}
        installStatus={dependencyInstallStatus}
        installError={dependencyInstallError}
        isInstallInProgress={isDependencyInstallInProgress}
        installProgress={dependencyInstallProgress}
        installLabel={dependencyInstallLabel}
        onInstall={onInstallDependencies}
      />
    );
  }

  const showSuggestions = suggestionsOpen && suggestions.length > 0;
  const installingLabel =
    dependencyInstallTarget === 'ffmpeg' ? t('installingFfmpegBg') : t('installingSearchTools');
  const installingCaption = `${dependencyInstallLabel}... ${dependencyInstallProgress}%`;

  const resultRows = results.map(result => (
    <SearchResultRow
      key={result.id}
      result={result}
      downloadState={getDownloadState(result)}
      previewLoadingId={previewLoadingId}
      isPreviewPlaying={isPreviewPlaying}
      onPreview={onPreview}
      onDownload={onDownload}
    />
  ));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('pageTitle')} />
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/55 pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            className={cn(
              'h-auto w-full pl-10 py-2.5 rounded-xl text-sm glass-subtle border-border/40',
              query ? 'pr-10' : 'pr-4',
              'text-foreground placeholder:text-muted-foreground/50',
              'focus-visible:ring-primary/40 focus-visible:border-primary/40',
              'shadow-none'
            )}
          />
          {isSearching ? (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
          ) : (
            query && (
              <button
                type="button"
                onClick={onClearQuery}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )
          )}

          {showSuggestions && (
            <SearchSuggestions
              suggestions={suggestions}
              highlightedIndex={highlightedIndex}
              setHighlightedIndex={setHighlightedIndex}
              onSelect={onSelectSuggestion}
            />
          )}
        </div>

        {isDependencyInstallInProgress && (
          <div className="mt-3 max-w-2xl rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{installingLabel}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{installingCaption}</p>
              </div>
            </div>
            <ProgressBar value={dependencyInstallProgress} className="mt-3 h-1.5" />
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex-1 overflow-y-auto scrollbar-thin px-6 pb-6',
          showCenteredSearchState && 'flex'
        )}
      >
        {showCenteredSearchState ? (
          isSearching ? (
            <SearchingCard query={query} />
          ) : searchError ? (
            <SearchErrorCard error={searchError} />
          ) : (
            <ViewEmptyState
              title={t('emptyTitle')}
              subtitle={t('emptySubtitle')}
              icon={Search}
              hints={[{ icon: Keyboard, label: t('emptyHintEnter') }]}
            />
          )
        ) : (
          <div className="mx-0 mb-0 rounded-2xl glass-panel border border-border/30 overflow-hidden px-2 py-1">
            <div className="space-y-1">{resultRows}</div>
          </div>
        )}
      </div>
    </div>
  );
}
