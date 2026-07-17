import { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@/hooks/useSearch';
import { useSearchDependencies } from '@/hooks/useSearchDependencies';
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions';
import type { ISearchViewView } from './SearchView.types';

export function useSearchView(): ISearchViewView {
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

  // Fire search when pendingSearchRef is set (after suggestion selection updates query).
  useEffect(() => {
    if (pendingSearchRef.current && query.trim()) {
      pendingSearchRef.current = false;
      handleSearch();
    }
  }, [query, handleSearch]);

  // Track whether the user has run at least one search so a zero-result outcome
  // can show a distinct "no results" empty instead of the initial pre-search one.
  // Reset when the query is cleared so the initial empty returns.
  const [hasSearched, setHasSearched] = useState(false);
  useEffect(() => {
    if (isSearching) setHasSearched(true);
  }, [isSearching]);
  useEffect(() => {
    if (query.trim() === '') setHasSearched(false);
  }, [query]);

  // A completed search that returned nothing (useSearch sets searchError to the
  // `noResults` copy in that case) — distinct from a genuine search failure.
  const showNoResults =
    hasSearched && !isSearching && results.length === 0 && searchError === t('noResults');

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

  const onClearQuery = useCallback(() => {
    setQuery('');
    closeSuggestions();
    inputRef.current?.focus();
  }, [setQuery, closeSuggestions]);

  const onInputFocus = useCallback(() => {
    if (suggestions.length > 0) {
      setSuggestionsOpen(true);
    }
  }, [suggestions.length, setSuggestionsOpen]);

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

  return {
    t,
    inputRef,
    query,
    setQuery,
    results,
    isSearching,
    searchError,
    onInputKeyDown: handleKeyDown,
    onClearQuery,
    onInputFocus,
    onInputBlur: closeSuggestions,
    getDownloadState,
    onDownload: handleDownload,
    onPreview: handlePreview,
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
    onInstallDependencies: handleInstallDependencies,
    suggestions,
    highlightedIndex,
    setHighlightedIndex,
    suggestionsOpen,
    onSelectSuggestion: selectAndSearch,
    showCenteredSearchState: results.length === 0,
    showNoResults,
  };
}
