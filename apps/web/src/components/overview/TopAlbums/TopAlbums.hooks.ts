import { useTranslation } from 'react-i18next';
import type { ITopAlbumRow, ITopAlbumsProps, ITopAlbumsView } from './TopAlbums.types';

/**
 * "Top albums this week" — the substitute for the mockup's genre "mood" card.
 * Genre data is too sparse to drive a faithful breakdown, so this keeps the card
 * slot + horizontal-bar visual but tallies album play counts.
 */
export function useTopAlbums({ albums }: ITopAlbumsProps): ITopAlbumsView {
  const { t } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');

  const maxPlays = albums.reduce((max, album) => Math.max(max, album.playCount), 0);

  const rows: ITopAlbumRow[] = albums.map(album => ({
    key: `${album.album}-${album.artist}`,
    album: album.album,
    artist: album.artist || tCommon('unknownArtist'),
    width: maxPlays > 0 ? Math.max(6, Math.round((album.playCount / maxPlays) * 100)) : 0,
    playsLabel: t('albumPlays', { count: album.playCount }),
  }));

  return {
    title: t('topAlbums', { em: t('topAlbumsEm') }),
    hasAlbums: albums.length > 0,
    emptyCopy: t('albumsEmptyCopy'),
    rows,
  };
}
