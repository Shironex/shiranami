import { useTranslation } from 'react-i18next';
import type { ISearchingCardProps, ISearchingCardView } from './SearchingCard.types';

/**
 * SearchingCard is a pure presentational card; the hook resolves its two
 * localized strings — trimming the echoed query so leading/trailing whitespace
 * never reaches the copy — so the shell stays a thin, logic-free render.
 */
export function useSearchingCard({ query }: ISearchingCardProps): ISearchingCardView {
  const { t } = useTranslation('search');

  return {
    title: t('searchingYoutube'),
    subtitle: t('pullingMatches', { query: query.trim() }),
  };
}
