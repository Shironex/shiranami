import type { ISearchStateCardProps, ISearchStateCardView } from './SearchStateCard.types';

/**
 * SearchStateCard is a pass-through over the shared `StatusCard`; the hook
 * forwards its visual props untouched — the defaults belong to `StatusCard`, so
 * resolving them here would fork the two components' behaviour — leaving the
 * shell a thin, logic-free render.
 */
export function useSearchStateCard({
  title,
  description,
  loading,
  children,
}: ISearchStateCardProps): ISearchStateCardView {
  return { title, description, loading, children };
}
