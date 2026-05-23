import { useTranslation } from 'react-i18next';
import { AlertCircle, LayoutDashboard } from 'lucide-react';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useOverviewData } from '@/hooks/useOverviewData';
import { OverviewViewSkeleton } from '@/components/overview/OverviewViewSkeleton';

export default function OverviewView() {
  const { t } = useTranslation('overview');
  const { t: tCommon } = useTranslation('common');
  const { hasLibrary, libraryLoaded, isLoading, isError, refetch } = useOverviewData();
  const { handleOpenFolder } = useLibraryActions();

  if (isError) {
    return (
      <ViewEmptyState
        variant="error"
        title={t('errorTitle')}
        subtitle={t('errorSubtitle')}
        icon={AlertCircle}
        action={{
          label: tCommon('retry'),
          onClick: () => {
            void refetch();
          },
        }}
      />
    );
  }

  if (isLoading || !libraryLoaded) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <OverviewViewSkeleton />
      </div>
    );
  }

  // First run, no music at all: the hero/clock would float over empty panels,
  // so show a single welcoming empty state instead. Overview is the landing
  // view, so this is effectively the new-user surface.
  if (!hasLibrary) {
    return (
      <ViewEmptyState
        title={t('firstRunTitle')}
        subtitle={t('firstRunSubtitle')}
        icon={LayoutDashboard}
        action={{ label: t('firstRunAction'), onClick: () => void handleOpenFolder() }}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="flex w-full flex-col gap-6 px-6 pb-10 pt-6" />
    </div>
  );
}
