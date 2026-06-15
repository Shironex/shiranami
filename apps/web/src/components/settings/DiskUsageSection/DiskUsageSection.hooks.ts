import { useTranslation } from 'react-i18next';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { useDiskUsageQuery } from '@/hooks/queries/useDiskUsage';
import type { IDiskUsageSectionView } from './DiskUsageSection.types';

export function useDiskUsageSection(): IDiskUsageSectionView {
  const { t } = useTranslation('settings');
  const { data: folders = [], isLoading: isFoldersLoading } = useFoldersQuery();
  const { data, isLoading, isError, isFetching, refetch } = useDiskUsageQuery();

  const hasFolders = folders.length > 0;

  return {
    t,
    hasFolders,
    // Show the spinner while folders are still loading too, so the "no folders"
    // empty state never flashes before the list arrives.
    isLoading: isFoldersLoading || isLoading,
    isError,
    isFetching,
    volumes: data?.volumes ?? [],
    onRefresh: () => void refetch(),
  };
}
