import { useTranslation } from 'react-i18next';
import { formatListenTime } from '@/components/history/historyUtils';
import type {
  IHistoryTopArtistRowProps,
  IHistoryTopArtistRowView,
} from './HistoryTopArtistRow.types';

export function useHistoryTopArtistRow({
  artist,
}: IHistoryTopArtistRowProps): IHistoryTopArtistRowView {
  const { t } = useTranslation('history');

  return {
    artistName: artist.artist || t('unknownArtist', { ns: 'common' }),
    listenTime: formatListenTime(artist.listenedSeconds),
    playsLabel: t('plays', { count: artist.playCount }),
  };
}
