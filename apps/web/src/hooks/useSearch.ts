import { useState, useEffect, useCallback } from 'react';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { useAudioPreview } from '@/hooks/useAudioPreview';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import type { SearchResult, DownloadProgress } from '@/types/electron';

interface DownloadState {
  progress: number;
  status: 'idle' | 'downloading' | 'converting' | 'done' | 'error';
  error?: string;
  filePath?: string;
}

export type { DownloadState };

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});

  const { importTrack } = useTrackImport();
  const { previewLoadingId, isPreviewPlaying, handlePreview } = useAudioPreview(
    i18n.t('previewAlbum', { ns: 'search' })
  );

  // Listen to download progress events
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onProgress((data: DownloadProgress) => {
      setDownloads(prev => ({
        ...prev,
        [data.url]: {
          ...prev[data.url],
          progress: data.progress,
          status: data.status,
          error: data.error,
        },
      }));
    });
    return cleanup;
  }, []);

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

  const handleDownload = useCallback(
    async (result: SearchResult) => {
      if (!IS_ELECTRON) return;
      const url = result.webpage_url || result.url;

      setDownloads(prev => ({
        ...prev,
        [url]: { progress: 0, status: 'downloading' },
      }));

      try {
        const filePath = await window.electronAPI.downloader.download(url);
        setDownloads(prev => ({
          ...prev,
          [url]: { progress: 100, status: 'done', filePath },
        }));
        const track = await importTrack(filePath);
        if (track) {
          // Cache the YouTube video ID for accurate sharing later
          if (result.id) {
            window.electronAPI.share.cacheYoutubeId(track.id, result.id).catch(() => {});
          }
          toast.success(i18n.t('downloaded', { ns: 'toast', title: track.title }));
        } else {
          toast.info(i18n.t('trackAlreadyInLibrary', { ns: 'toast' }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : i18n.t('unknownError', { ns: 'common' });
        setDownloads(prev => ({
          ...prev,
          [url]: { progress: 0, status: 'error', error: msg },
        }));
        toast.error(i18n.t('downloadFailed', { ns: 'toast', error: msg }));
      }
    },
    [importTrack]
  );

  const getDownloadState = useCallback(
    (result: SearchResult): DownloadState => {
      const url = result.webpage_url || result.url;
      return downloads[url] ?? { progress: 0, status: 'idle' };
    },
    [downloads]
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
