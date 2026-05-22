import { StatusCard } from '@/components/shared/StatusCard';

interface SearchStateCardProps {
  title: string;
  description: string;
  loading?: boolean;
  children?: React.ReactNode;
}

/**
 * Thin wrapper over the shared `StatusCard`, kept for SearchView's existing
 * call sites. New status surfaces should use `StatusCard` directly.
 */
export function SearchStateCard({ title, description, loading, children }: SearchStateCardProps) {
  return (
    <StatusCard title={title} description={description} loading={loading}>
      {children}
    </StatusCard>
  );
}
