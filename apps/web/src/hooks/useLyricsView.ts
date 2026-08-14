import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLyricsQuery, type LyricLine, type LyricsSource } from '@/hooks/queries/useLyrics';
import { useActiveLineIndex } from '@/lib/lyrics';

interface UseLyricsViewResult {
  synced: LyricLine[] | null;
  plain: string | null;
  /** Where the lyrics were resolved from (local file, embedded tag, LRCLIB). */
  source: LyricsSource;
  /** Index of the active synced line, or -1. */
  activeLine: number;
  isLoading: boolean;
  isError: boolean;
  /** Re-run the failed lyrics fetch (drives the error-branch Retry action). */
  retry: () => void;
  /** Seek to a line's timestamp. */
  handleLineClick: (time: number) => void;
}

/**
 * Shared lyrics data layer behind NowPlayingView and LyricsPanel: fetches the
 * current track's lyrics, derives synced/plain + the active synced line, fires
 * the single de-duplicated "failed to fetch" error toast, and exposes a
 * line-click seek handler. Returns nulls when no track is playing.
 *
 * Both views previously reimplemented this identically; wiring them onto the
 * hook is Phase 3.
 */
export function useLyricsView(): UseLyricsViewResult {
  const { t: tToast } = useTranslation('toast');
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const seek = usePlaybackStore(s => s.seek);

  const { data, isLoading, isError, refetch } = useLyricsQuery(
    currentTrack?.id ?? null,
    currentTrack?.title ?? '',
    currentTrack?.artist ?? '',
    currentTrack?.album,
    currentTrack?.duration,
    currentTrack?.filePath
  );

  useEffect(() => {
    if (isError) {
      toast.error(tToast('failedFetchLyrics'), { id: 'lyrics-fetch-error' });
    }
  }, [isError, tToast]);

  const synced = data?.synced ?? null;
  const plain = data?.plain ?? null;
  const source = data?.source ?? null;
  const activeLine = useActiveLineIndex(synced);

  const handleLineClick = useCallback((time: number) => seek(time), [seek]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { synced, plain, source, activeLine, isLoading, isError, retry, handleLineClick };
}
