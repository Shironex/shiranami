import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { IS_ELECTRON } from '@/lib/platform';
import { useDiscoverDownload } from '@/hooks/useDiscoverDownload';
import { useRadioDiaryStore } from '@/stores/useRadioDiaryStore';
import type {
  IRadioDiaryEntryView,
  IRadioDiaryProps,
  IRadioDiaryView,
  RadioDiaryFetchStatus,
} from './RadioDiary.types';

/** Per-entry status for the download action, keyed by row id. */
type FetchStatuses = Record<number, RadioDiaryFetchStatus>;

export function useRadioDiary({
  stationUuid,
  stationName,
  onClose,
}: IRadioDiaryProps): IRadioDiaryView {
  const { t } = useTranslation('radio');

  const entries = useRadioDiaryStore(s => s.entries);
  const loadedStation = useRadioDiaryStore(s => s.stationUuid);
  const isLoading = useRadioDiaryStore(s => s.isLoading);
  const load = useRadioDiaryStore(s => s.load);

  const { download } = useDiscoverDownload();
  const [statuses, setStatuses] = useState<FetchStatuses>({});

  useEffect(() => {
    if (!stationUuid) return;
    void load(stationUuid);
  }, [stationUuid, load]);

  const setStatus = useCallback((id: number, status: RadioDiaryFetchStatus) => {
    setStatuses(current => ({ ...current, [id]: status }));
  }, []);

  /**
   * Turn a station's title into a download.
   *
   * The query is the **raw** title, not the derived split: it is what the user
   * is looking at, and when the split came out wrong the raw string is the only
   * one that still describes the song. Search and enqueue are both the existing
   * paths — `downloader:search` and the discover shelf's enqueue — so a track
   * caught on the radio lands in the queue the same way every other one does.
   *
   * Never automatic. This runs from a click and from nothing else.
   */
  const getTrack = useCallback(
    async (id: number, raw: string) => {
      if (!IS_ELECTRON) return;

      setStatus(id, 'searching');
      try {
        const results = await window.electronAPI.downloader.search(raw);
        const best = results[0];
        if (!best) {
          setStatus(id, 'error');
          toast.error(i18n.t('diaryNoMatch', { ns: 'radio' }));
          return;
        }

        download({
          youtubeId: best.id,
          title: best.title,
          uploader: best.uploader,
          thumbnail: best.thumbnail,
          url: best.webpage_url,
        });
        setStatus(id, 'queued');
      } catch (err) {
        logger.error('[radio] failed to look up a logged title', err);
        setStatus(id, 'error');
        toast.error(i18n.t('failedQueueDownload', { ns: 'toast' }));
      }
    },
    [download, setStatus]
  );

  const language = i18n.language;

  const entryViews = useMemo<IRadioDiaryEntryView[]>(() => {
    const timeFormat = new Intl.DateTimeFormat(language, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const stampFormat = new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return entries.map(entry => {
      const heardAt = new Date(entry.heardAt);
      const status = statuses[entry.id] ?? 'idle';
      return {
        id: entry.id,
        raw: entry.raw,
        timeLabel: timeFormat.format(heardAt),
        timestampLabel: stampFormat.format(heardAt),
        status,
        actionLabel: t('diaryGetTrack', { title: entry.raw }),
        onGetTrack: () => {
          if (status === 'searching' || status === 'queued') return;
          void getTrack(entry.id, entry.raw);
        },
      };
    });
  }, [entries, statuses, language, t, getTrack]);

  // The store holds one station at a time, so entries belonging to a station
  // other than this one are the previous station's, mid-swap.
  const isCurrent = stationUuid !== null && loadedStation === stationUuid;

  return {
    t,
    entries: isCurrent ? entryViews : [],
    isLoading: isLoading || (stationUuid !== null && !isCurrent),
    stationLabel: stationName ?? '',
    hasStation: stationUuid !== null,
    isEmpty: isCurrent && !isLoading && entryViews.length === 0,
    onClose,
  };
}
