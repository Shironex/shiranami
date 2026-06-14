import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '../overviewUtils';
import type {
  IRecentlyAddedProps,
  IRecentlyAddedRow,
  IRecentlyAddedView,
} from './RecentlyAdded.types';

export function useRecentlyAdded({ tracks }: IRecentlyAddedProps): IRecentlyAddedView {
  const { t, i18n } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');

  const rows: IRecentlyAddedRow[] = tracks.map(track => {
    const relative = formatRelativeTime(track.createdAt, i18n.language);
    const artist = track.artist || tCommon('unknownArtist');
    return {
      id: track.id,
      title: track.title,
      subtitle: relative ? `${artist} · ${relative}` : artist,
      albumArt: track.albumArt,
      coverSeed: track.album || track.artist,
      playAria: t('playAria', { title: track.title }),
    };
  });

  return {
    title: t('recentlyAdded', { em: t('recentlyAddedEm') }),
    countLabel: t('recentCount', { count: tracks.length }),
    rows,
  };
}
