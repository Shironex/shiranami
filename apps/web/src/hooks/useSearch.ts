import { useState, useCallback, useRef } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import i18n from '@/lib/i18n';
import { translateYtDlpError } from '@/lib/ytdlpErrors';
import type { SearchResult } from '@/types/electron';
import type { DownloadQueueStatus } from '@shiranami/contracts';

interface DownloadState {
  progress: number;
  status: 'idle' | 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
  filePath?: string;
}

export type { DownloadState };

/** Map the main-queue lifecycle status onto the search row's UI status. */
function mapQueueStatus(status: DownloadQueueStatus): DownloadState['status'] {
  switch (status) {
    case 'queued':
    case 'active':
      return 'downloading';
    case 'converting':
      return 'converting';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'canceled':
      return 'idle';
  }
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Synchronous in-flight set keyed by URL so a fast double-trigger enqueues once.
  const downloadInFlightRef = useRef<Set<string>>(new Set());

  // Subscribe to the queue store so rows re-render as their items advance.
  const byUrl = useDownloadQueueStore(s => s.byUrl);

  const { previewLoadingId, isPreviewPlaying, handlePreview } = useAudioPreview(
    i18n.t('previewAlbum', { ns: 'search' })
  );

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || !IS_ELECTRON) return;

    setIsSearching(true);
    setSearchError(null);
    setResults([]);

    try {
      const searchResults = await window.electronAPI.downloader.search(trimmed);
      setResults(searchResults);
      if (searchResults.length === 0) {
        setSearchError(i18n.t('noResults', { ns: 'search' }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('searchFailed', { ns: 'toast' });
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const handleDownload = useCallback((result: SearchResult) => {
    if (!IS_ELECTRON) return;
    const url = result.webpage_url || result.url;
    // Guard against a duplicate enqueue from a rapid double-trigger.
    if (downloadInFlightRef.current.has(url)) return;
    downloadInFlightRef.current.add(url);

    window.electronAPI.downloader
      .enqueueDownload({
        url,
        youtubeId: result.id,
        title: result.title,
        thumbnail: result.thumbnail,
      })
      .catch(() => {})
      .finally(() => {
        downloadInFlightRef.current.delete(url);
      });
    // Import + success/dup toast happen in the central queue importer.
  }, []);

  const getDownloadState = useCallback(
    (result: SearchResult): DownloadState => {
      const url = result.webpage_url || result.url;
      const item = byUrl.get(url);
      if (!item) return { progress: 0, status: 'idle' };
      return {
        progress: item.progress,
        status: mapQueueStatus(item.status),
        error: item.error ? translateYtDlpError(item.error) : undefined,
        filePath: item.filePath,
      };
    },
    [byUrl]
  );

  return {
    query,
    setQuery,
    results,
    isSearching,
    searchError,
    handleSearch,
    handleKeyDown,
    handleDownload,
    getDownloadState,
    previewLoadingId,
    isPreviewPlaying,
    handlePreview,
  };
}
