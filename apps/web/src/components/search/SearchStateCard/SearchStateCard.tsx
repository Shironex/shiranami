import { StatusCard } from '@/components/shared/StatusCard';
import { useSearchStateCard } from './SearchStateCard.hooks';
import type { ISearchStateCardProps } from './SearchStateCard.types';

/**
 * Thin wrapper over the shared `StatusCard`, kept for SearchView's existing
 * call sites. New status surfaces should use `StatusCard` directly.
 */
export default function SearchStateCard(props: ISearchStateCardProps) {
  const { title, description, loading, children } = useSearchStateCard(props);

  return (
    <StatusCard title={title} description={description} loading={loading}>
      {children}
    </StatusCard>
  );
}
