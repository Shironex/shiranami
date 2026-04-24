import { useState, useCallback } from 'react';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { IS_ELECTRON } from '@/lib/platform';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { translateYtDlpError } from '@/lib/ytdlpErrors';

export interface PreviewableItem {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail?: string;
  url: string;
  webpage_url?: string;
}

/**
 * Shared hook for previewing audio from a search result or playlist track.
 * Streams audio via yt-dlp without downloading.
 */
export function useAudioPreview(albumLabel = i18n.t('previewSource', { ns: 'common' })) {
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const setQueue = usePlaybackStore(s => s.setQueue);

  const isPreviewPlaying = useCallback(
    (item: { id: string }) => {
      return currentTrack?.id === `preview-${item.id}` && isPlaying;
    },
    [currentTrack, isPlaying]
  );

  const handlePreview = useCallback(
    async (item: PreviewableItem) => {
      if (!IS_ELECTRON) return;

      const previewTrackId = `preview-${item.id}`;

      if (currentTrack?.id === previewTrackId) {
        usePlaybackStore.getState().togglePlay();
        return;
      }

      setPreviewLoadingId(item.id);

      try {
        const streamUrl = await window.electronAPI.downloader.getStreamUrl(
          item.webpage_url || item.url
        );

        const previewTrack: Track = {
          id: previewTrackId,
          title: item.title,
          artist: item.uploader,
          album: albumLabel,
          duration: item.duration,
          filePath: `shiranami-radio://stream?url=${encodeURIComponent(streamUrl)}`,
          albumArt: item.thumbnail || undefined,
        };

        setQueue([previewTrack], 0);
      } catch (err) {
        const raw = err instanceof Error ? err.message : i18n.t('unknownError', { ns: 'common' });
        const msg = translateYtDlpError(raw);
        toast.error(i18n.t('previewFailed', { ns: 'toast', error: msg }));
      } finally {
        setPreviewLoadingId(null);
      }
    },
    [currentTrack, setQueue, albumLabel]
  );

  return { previewLoadingId, isPreviewPlaying, handlePreview };
}
