import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Download,
  Check,
  AlertCircle,
  Loader2,
  Music,
  Play,
  Pause,
  X,
  Keyboard,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatViewCount } from '@/lib/formatViewCount';
import { formatDuration } from '@shiranami/shared';
import { useSearch } from '@/hooks/useSearch';
import { useSearchDependencies } from '@/hooks/useSearchDependencies';
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';
import { SearchStateCard } from './SearchStateCard';
import { DependencyInstallCard } from './DependencyInstallCard';
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
            <ul
              className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden"
              role="listbox"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 text-sm cursor-pointer transition-colors',
                    index === highlightedIndex
                      ? 'bg-accent text-foreground'
                      : 'text-foreground/80 hover:bg-accent/50'
                  )}
                  onMouseDown={e => {
                    e.preventDefault(); // Prevent input blur
                    selectAndSearch(suggestion);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <Search className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  <span className="truncate">{suggestion}</span>
                </li>
              ))}
            </ul>
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
            <div className="flex-1 min-h-full flex items-center justify-center">
              <div className="w-full max-w-lg flex flex-col items-center gap-6 px-10 py-14 text-center glass-subtle rounded-[28px] border border-border/30">
                <div className="relative">
                  <div className="w-28 h-28 rounded-[28px] bg-primary/8 border border-primary/10 flex items-center justify-center">
                    <img
                      src="./mascot.png"
                      alt=""
                      aria-hidden="true"
                      className="w-[4.5rem] h-[4.5rem] object-contain opacity-70 float-mascot"
                      draggable={false}
                    />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-foreground/85">
                    {t('searchingYoutube')}
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1.5 leading-relaxed">
                    {t('pullingMatches', { query: query.trim() })}
                  </p>
                </div>
              </div>
            </div>
          ) : searchError ? (
            <div className="flex-1 min-h-full flex items-center justify-center">
              <div className="w-full max-w-lg flex flex-col items-center gap-6 px-10 py-14 text-center glass-subtle rounded-[28px] border border-border/30">
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
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  </div>
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-foreground/85">
                    {t('noResults')}
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto leading-relaxed">
                    {searchError}
                  </p>
                </div>
              </div>
            </div>
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
              {results.map(result => {
                const dlState = getDownloadState(result);
                const isDownloading =
                  dlState.status === 'downloading' || dlState.status === 'converting';
                const isDone = dlState.status === 'done';
                const isError = dlState.status === 'error';

                return (
                  <div
                    key={result.id}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/50 transition-colors relative overflow-hidden"
                  >
                    {isDownloading && (
                      <div
                        className="absolute inset-0 bg-primary/5 transition-all duration-300"
                        role="progressbar"
                        aria-valuenow={dlState.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        style={{ width: `${dlState.progress}%` }}
                      />
                    )}

                    <button
                      onClick={() => handlePreview(result)}
                      className="w-11 h-11 rounded-lg overflow-hidden bg-muted shrink-0 relative z-10 group/thumb"
                      title={isPreviewPlaying(result) ? t('pausePreview') : t('preview')}
                    >
                      {result.thumbnail ? (
                        <img
                          src={result.thumbnail}
                          alt={result.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity',
                          isPreviewPlaying(result)
                            ? 'opacity-100'
                            : 'opacity-0 group-hover/thumb:opacity-100'
                        )}
                      >
                        {previewLoadingId === result.id ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : isPreviewPlaying(result) ? (
                          <Pause className="w-4 h-4 text-white" />
                        ) : (
                          <Play className="w-4 h-4 text-white" />
                        )}
                      </div>
                    </button>

                    <div className="flex-1 min-w-0 relative z-10">
                      <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {result.uploader}
                        {result.view_count != null &&
                          (() => {
                            const { key, count } = formatViewCount(result.view_count);
                            return (
                              <span className="text-muted-foreground/50">
                                {' '}
                                · {t(key, { count })}
                              </span>
                            );
                          })()}
                      </p>
                    </div>

                    <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0 relative z-10">
                      {formatDuration(result.duration)}
                    </span>

                    <div className="shrink-0 relative z-10 w-9">
                      {isDone ? (
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-green-400">
                          <Check className="w-4 h-4" />
                        </div>
                      ) : isDownloading ? (
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        </div>
                      ) : isError ? (
                        <button
                          onClick={() => handleDownload(result)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                          title={dlState.error ?? t('retryDownload')}
                        >
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownload(result)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                          title={t('download')}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SearchView;
