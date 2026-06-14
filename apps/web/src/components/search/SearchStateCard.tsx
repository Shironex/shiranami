import { StatusCard } from '@/components/shared/StatusCard';

interface ISearchStateCardProps {
  readonly title: string;
  readonly description: string;
  readonly loading?: boolean;
  readonly children?: React.ReactNode;
}

/**
 * Thin wrapper over the shared `StatusCard`, kept for SearchView's existing
 * call sites. New status surfaces should use `StatusCard` directly.
 */
export function SearchStateCard({ title, description, loading, children }: ISearchStateCardProps) {
  return (
    <StatusCard title={title} description={description} loading={loading}>
      {children}
    </StatusCard>
  );
}
