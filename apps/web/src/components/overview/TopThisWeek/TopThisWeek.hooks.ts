import { useTranslation } from 'react-i18next';
import { pad2 } from '@shiranami/shared';
import type { ITopThisWeekProps, ITopThisWeekRow, ITopThisWeekView } from './TopThisWeek.types';

export function useTopThisWeek({ tracks }: ITopThisWeekProps): ITopThisWeekView {
  const { t } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');

  const maxPlays = tracks.reduce((max, track) => Math.max(max, track.playCount), 0);

  const rows: ITopThisWeekRow[] = tracks.map((track, index) => {
    const artist = track.artist || tCommon('unknownArtist');
    return {
      trackId: track.trackId,
      rankLabel: pad2(index + 1),
      title: track.title,
      subtitle: track.album ? `${artist} · ${track.album}` : artist,
      albumArt: track.albumArt,
      coverSeed: track.album || track.artist,
      width: maxPlays > 0 ? Math.max(8, Math.round((track.playCount / maxPlays) * 100)) : 0,
      playCount: track.playCount,
      playAria: t('playAria', { title: track.title }),
    };
  });

  return {
    title: t('topThisWeek', { em: t('topThisWeekEm') }),
    openLibraryLabel: t('openLibrary'),
    hasTracks: tracks.length > 0,
    emptyCopy: t('topEmptyCopy'),
    rows,
  };
}
