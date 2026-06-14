import type { RefObject } from 'react';
import type { useTranslation } from 'react-i18next';
import type { SearchResult } from '@/types/electron';
import type { DownloadState } from '@/hooks/useSearch';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export type SearchDependencyState = 'checking' | 'needs-install' | 'ready';

export interface ISearchViewView {
  /** Bound `search` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Ref bound to the search input for focus management. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
  /** Current query string. */
  readonly query: string;
  /** Set the query string. */
  readonly setQuery: (value: string) => void;
  /** Search results for the current query. */
  readonly results: readonly SearchResult[];
  /** A search request is in flight. */
  readonly isSearching: boolean;
  /** Last search error message, or null. */
  readonly searchError: string | null;
  /** Key handler for the input (suggestion nav + search submit). */
  readonly onInputKeyDown: (e: React.KeyboardEvent) => void;
  /** Clear the query and refocus the input. */
  readonly onClearQuery: () => void;
  /** Focus handler: opens suggestions when any exist. */
  readonly onInputFocus: () => void;
  /** Blur handler: closes the suggestions popover. */
  readonly onInputBlur: () => void;
  /** Resolve a result's current download state. */
  readonly getDownloadState: (result: SearchResult) => DownloadState;
  /** Trigger (or retry) a result's download. */
  readonly onDownload: (result: SearchResult) => void;
  /** Toggle a result's audio preview. */
  readonly onPreview: (result: SearchResult) => void;
  /** Id of the result whose preview is loading, or null. */
  readonly previewLoadingId: string | null;
  /** Whether a result's preview is currently playing. */
  readonly isPreviewPlaying: (result: SearchResult) => boolean;

  /** Dependency-check lifecycle state. */
  readonly dependencyState: SearchDependencyState;
  /** Snapshot of installed dependencies (null until checked). */
  readonly dependenciesSnapshot: { readonly ffmpegInstalled: boolean } | null;
  /** Dependency install status. */
  readonly dependencyInstallStatus: 'idle' | 'downloading' | 'done' | 'error';
  /** Dependency install error message, or null. */
  readonly dependencyInstallError: string | null;
  /** A dependency install is in progress. */
  readonly isDependencyInstallInProgress: boolean;
  /** Dependency install progress percent. */
  readonly dependencyInstallProgress: number;
  /** Dependency install step label. */
  readonly dependencyInstallLabel: string;
  /** Which dependency is currently being installed (null when idle). */
  readonly dependencyInstallTarget: 'ytdlp' | 'ffmpeg' | null;
  /** Start installing missing dependencies. */
  readonly onInstallDependencies: () => void;

  /** Suggestions for the current query. */
  readonly suggestions: readonly string[];
  /** Index of the highlighted suggestion (-1 = none). */
  readonly highlightedIndex: number;
  /** Set the highlighted suggestion index. */
  readonly setHighlightedIndex: (index: number) => void;
  /** Whether the suggestions popover is open. */
  readonly suggestionsOpen: boolean;
  /** Select a suggestion and run the search for it. */
  readonly onSelectSuggestion: (text: string) => void;

  /** Show the centered (no-results) search state instead of the result list. */
  readonly showCenteredSearchState: boolean;
}
