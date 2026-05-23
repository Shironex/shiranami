import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { IS_ELECTRON } from '@/lib/platform';
import { useTrackImport } from '@/hooks/useTrackImport';
import { translateYtDlpError } from '@/lib/ytdlpErrors';
import { logger } from '@/lib/logger';
import type { DiscoverRecommendation } from '@shiranami/contracts';

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

/**
 * Downloads + imports a discovered (not-yet-owned) track into the library,
 * reusing the same downloader → importTrack flow as search. Tracks a per-item
 * status keyed by youtubeId so the shelf can disable/label a single row while
 * it downloads. yt-dlp failures surface as a translated toast, never a crash.
 */
export function useDiscoverDownload() {
  const { importTrack } = useTrackImport();
  const [statuses, setStatuses] = useState<Record<string, DownloadStatus>>({});

  const setStatus = useCallback((youtubeId: string, status: DownloadStatus) => {
    setStatuses(prev => ({ ...prev, [youtubeId]: status }));
  }, []);

  const download = useCallback(
    async (item: DiscoverRecommendation) => {
      if (!IS_ELECTRON || statuses[item.youtubeId] === 'downloading') return;
      setStatus(item.youtubeId, 'downloading');
      try {
        const filePath = await window.electronAPI.downloader.download(item.url);
        const track = await importTrack(filePath);
        if (track) {
          if (item.youtubeId) {
            window.electronAPI.share.cacheYoutubeId(track.id, item.youtubeId).catch(() => {});
          }
          toast.success(i18n.t('downloaded', { ns: 'toast', title: track.title }));
        } else {
          toast.info(i18n.t('trackAlreadyInLibrary', { ns: 'toast' }));
        }
        setStatus(item.youtubeId, 'done');
      } catch (err) {
        const raw = err instanceof Error ? err.message : i18n.t('unknownError', { ns: 'common' });
        logger.error('[recommendations] discover download failed', err);
        toast.error(i18n.t('downloadFailed', { ns: 'toast', error: translateYtDlpError(raw) }));
        setStatus(item.youtubeId, 'error');
      }
    },
    [importTrack, setStatus, statuses]
  );

  return { download, statuses };
}
