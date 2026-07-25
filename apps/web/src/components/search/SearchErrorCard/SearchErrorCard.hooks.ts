import { useTranslation } from 'react-i18next';
import type { ISearchErrorCardProps, ISearchErrorCardView } from './SearchErrorCard.types';

/**
 * SearchErrorCard is a pure presentational card; the hook resolves the
 * localized heading and forwards the raw failure message (which comes from
 * yt-dlp and is already human-readable) so the shell stays a thin, logic-free
 * render.
 */
export function useSearchErrorCard({ error }: ISearchErrorCardProps): ISearchErrorCardView {
  const { t } = useTranslation('search');

  return {
    title: t('noResults'),
    error,
  };
}
