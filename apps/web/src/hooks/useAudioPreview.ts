import { useState, useCallback } from 'react';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';
import { IS_ELECTRON } from '@/lib/platform';
import { toast } from 'sonner';

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
export function useAudioPreview(albumLabel = 'Preview') {
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setQueue = usePlayerStore((s) => s.setQueue);

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
        usePlayerStore.getState().togglePlay();
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
        const msg = err instanceof Error ? err.message : 'Failed to load preview';
        toast.error(`Preview failed: ${msg}`);
      } finally {
        setPreviewLoadingId(null);
      }
    },
    [currentTrack, setQueue, albumLabel]
  );

  return { previewLoadingId, isPreviewPlaying, handlePreview };
}
