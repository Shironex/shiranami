import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { RowComponentProps } from 'react-window';
import { isoCodeToFlag } from '../radioUtils';
import type { IStationRowProps, IStationRowView } from './StationRow.types';

export function useStationRow(props: RowComponentProps<IStationRowProps>): IStationRowView {
  const { t } = useTranslation('radio');
  const { t: tCommon } = useTranslation('common');
  const { index, style, stations, currentTrackId, isPlaying, favorites, onPlay, onToggleFavorite } =
    props;

  const station = stations[index];

  const isActive = station ? currentTrackId === `radio:${station.id}` : false;
  const isFav = station ? favorites.includes(station.id) : false;
  const tagsStr = station && Array.isArray(station.tags) ? station.tags.slice(0, 2).join(', ') : '';
  const countryFlag = station ? isoCodeToFlag(station.countryCode) : '';
  const bitrateSuffix = station && station.bitrate > 0 ? ` ${station.bitrate}k` : '';
  const codecLabel = station?.codec ? `${station.codec}${bitrateSuffix}` : '';

  const onFaviconError = useCallback((event: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    img.nextElementSibling?.classList.remove('hidden');
  }, []);

  const onPlayClick = useCallback(() => onPlay(index), [onPlay, index]);

  const onFavoriteClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (station) onToggleFavorite(station);
    },
    [station, onToggleFavorite]
  );

  return {
    station,
    style,
    index,
    isActive,
    isFav,
    isPlaying,
    tagsStr,
    countryFlag,
    codecLabel,
    favoriteAriaLabel: isFav ? t('removeFavorite') : t('addFavorite'),
    nowPlayingLabel: tCommon('nowPlaying'),
    onPlayClick,
    onFavoriteClick,
    onFaviconError,
  };
}
