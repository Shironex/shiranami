import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, X, Keyboard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSearch } from '@/hooks/useSearch';
import { useSearchDependencies } from '@/hooks/useSearchDependencies';
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';
import { SearchStateCard } from './SearchStateCard';
import { DependencyInstallCard } from './DependencyInstallCard';
import { SearchSuggestions } from './SearchSuggestions';
import { SearchResultRow } from './SearchResultRow';
import { SearchingCard, SearchErrorCard } from './SearchStatusCards';
import { ViewEmptyState } from '../shared/ViewEmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProgressBar } from '@/components/ui/progress-bar';

export function SearchView() {
  const { t } = useTranslation('search');
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    query,
    setQuery,
    results,
    isSearching,
    searchError,
    handleSearch,
    handleKeyDown: originalHandleKeyDown,
    handleDownload,
    getDownloadState,
    previewLoadingId,
    isPreviewPlaying,
    handlePreview,
  } = useSearch();

  const {
    suggestions,
    highlightedIndex,
    setHighlightedIndex,
    isOpen: suggestionsOpen,
    setIsOpen: setSuggestionsOpen,
    close: closeSuggestions,
    dismiss: dismissSuggestions,
  } = useSearchSuggestions(query);

  const pendingSearchRef = useRef(false);

  const selectAndSearch = useCallback(
    (text: string) => {
      setQuery(text);
      dismissSuggestions();
      pendingSearchRef.current = true;
    },
    [setQuery, dismissSuggestions]
  );

  // Fire search when pendingSearchRef is set (after suggestion selection updates query)
  useEffect(() => {
    if (pendingSearchRef.current && query.trim()) {
      pendingSearchRef.current = false;
      handleSearch();
    }
  }, [query, handleSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (suggestionsOpen && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
          return;
        }
        if (e.key === 'Enter') {
          if (highlightedIndex >= 0) {
            e.preventDefault();
            selectAndSearch(suggestions[highlightedIndex]);
            return;
          }
          dismissSuggestions();
          // fall through to originalHandleKeyDown for the actual search
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeSuggestions();
          return;
        }
      }
      originalHandleKeyDown(e);
    },
    [
      suggestionsOpen,
      suggestions,
      highlightedIndex,
      setHighlightedIndex,
      closeSuggestions,
      dismissSuggestions,
      selectAndSearch,
      originalHandleKeyDown,
    ]
  );

  const {
    dependencyState,
    dependencyInstallStatus,
    dependencyInstallError,
    dependenciesSnapshot,
    isDependencyInstallInProgress,
    dependencyInstallProgress,
    dependencyInstallLabel,
    dependencyInstallTarget,
    handleInstallDependencies,
  } = useSearchDependencies();

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
        onInstall={handleInstallDependencies}
      />
    );
  }

  const showCenteredSearchState = results.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('pageTitle')} />
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
            onBlur={() => closeSuggestions()}
            placeholder={t('placeholder')}
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
                onClick={() => {
                  setQuery('');
                  closeSuggestions();
                  inputRef.current?.focus();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )
          )}

          {suggestionsOpen && suggestions.length > 0 && (
            <SearchSuggestions
              suggestions={suggestions}
              highlightedIndex={highlightedIndex}
              setHighlightedIndex={setHighlightedIndex}
              onSelect={selectAndSearch}
            />
          )}
        </div>

        {isDependencyInstallInProgress && (
          <div className="mt-3 max-w-2xl rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {dependencyInstallTarget === 'ffmpeg'
                    ? t('installingFfmpegBg')
                    : t('installingSearchTools')}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dependencyInstallLabel}... {dependencyInstallProgress}%
                </p>
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
            <div className="space-y-1">
              {results.map(result => (
                <SearchResultRow
                  key={result.id}
                  result={result}
                  downloadState={getDownloadState(result)}
                  previewLoadingId={previewLoadingId}
                  isPreviewPlaying={isPreviewPlaying}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchView;
