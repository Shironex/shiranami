import { useTranslation } from 'react-i18next';
import type { IOnThisNightCardProps, IOnThisNightCardView } from './OnThisNightCard.types';

/**
 * Narrates an anniversary memory in the recap card's voice — a soft heading,
 * the night's date as an eyebrow, and one prose line that scales from a
 * single drifting play to a track that carried the whole evening.
 */
export function useOnThisNightCard({ memory }: IOnThisNightCardProps): IOnThisNightCardView {
  const { t, i18n } = useTranslation('overview');

  const anchor = new Date(memory.anchorIso);
  const dateLabel = anchor.toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const year = memory.distance === 'year';
  const { track } = memory;

  return {
    title: t(year ? 'memories.titleYear' : 'memories.titleHalfYear'),
    titleEm: t(year ? 'memories.titleYearEm' : 'memories.titleHalfYearEm'),
    dateLabel,
    line: t('memories.line', { count: track.playCount }),
    trackTitle: track.title,
    trackSubtitle: track.album ? `${track.artist} · ${track.album}` : track.artist,
    albumArt: track.albumArt,
    coverSeed: track.album || track.artist,
    playAria: t('memories.playAria', { title: track.title, artist: track.artist }),
  };
}
