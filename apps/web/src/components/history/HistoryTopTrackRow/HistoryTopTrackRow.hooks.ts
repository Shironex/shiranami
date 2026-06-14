import { useTranslation } from 'react-i18next';
import { formatListenTime } from '@/components/history/historyUtils';
import type { IHistoryTopTrackRowProps, IHistoryTopTrackRowView } from './HistoryTopTrackRow.types';

export function useHistoryTopTrackRow({
  track,
  onPlay,
}: IHistoryTopTrackRowProps): IHistoryTopTrackRowView {
  const { t } = useTranslation('history');

  return {
    track,
    playsLabel: t('plays', { count: track.playCount }),
    listenTime: formatListenTime(track.listenedSeconds),
    onPlay: () => onPlay(track.trackId),
  };
}
