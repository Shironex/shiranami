import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { IS_ELECTRON } from '@/lib/platform';
import { useDiscoverDownload } from '@/hooks/useDiscoverDownload';
import { fold } from '@/hooks/useRadioNowPlaying';
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
   * The query is the whole title, not the derived split: it is what the user is
   * looking at, and when the split came out wrong the full string is the only
   * one that still describes the song. It is the *folded* form for the same
   * reason it is folded on screen — a station broadcasting `𝕻𝖑𝖆𝖞𝖎𝖓𝖌` in
   * mathematical alphanumerics gives yt-dlp nothing to match. Search and enqueue
   * are both the existing paths — `downloader:search` and the discover shelf's
   * enqueue — so a track caught on the radio lands in the queue the same way
   * every other one does.
   *
   * Never automatic. This runs from a click and from nothing else.
   *
   * The row goes to `queued` only once `download` says the track is actually
   * reaching the queue. It reports its own outcome precisely because the enqueue
   * can fail on its own — yt-dlp not installed yet, a full disk — and `queued`
   * disables the button, so believing an enqueue that never happened locks the
   * user out of retrying a row that no download exists for.
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

        const outcome = await download({
          youtubeId: best.id,
          title: best.title,
          uploader: best.uploader,
          thumbnail: best.thumbnail,
          url: best.webpage_url,
        });
        // `download` has already told the user why a failure failed, so this
        // only has to leave the row retryable.
        setStatus(id, outcome === 'failed' ? 'error' : 'queued');
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
      // Folded on the way out of the store and nowhere earlier: the row keeps
      // its raw `StreamTitle`, and every surface that shows one — this panel and
      // the player's title line beside it — folds it the same way at render.
      const titleLabel = fold(entry.raw);
      return {
        id: entry.id,
        titleLabel,
        timeLabel: timeFormat.format(heardAt),
        timestampLabel: stampFormat.format(heardAt),
        status,
        actionLabel: t('diaryGetTrack', { title: titleLabel }),
        onGetTrack: () => {
          if (status === 'searching' || status === 'queued') return;
          void getTrack(entry.id, titleLabel);
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
