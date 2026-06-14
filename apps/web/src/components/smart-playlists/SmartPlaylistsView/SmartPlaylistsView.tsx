import { AlertCircle, Plus, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ViewEmptyState } from '@/components/shared/ViewEmptyState';
import { Button } from '@/components/ui/button';
import { SmartPlaylistFormDialog } from '../SmartPlaylistFormDialog';
import { SmartPlaylistCard } from './SmartPlaylistCard';
import { SmartPlaylistDetail } from './SmartPlaylistDetail';
import { SmartPlaylistsViewSkeleton } from './SmartPlaylistsViewSkeleton';
import { useSmartPlaylistsView } from './SmartPlaylistsView.hooks';

export default function SmartPlaylistsView() {
  const {
    t,
    selectedId,
    showSkeleton,
    showError,
    retryLabel,
    isEmpty,
    sorted,
    createOpen,
    setCreateOpen,
    onOpen,
    onCreate,
    onRetry,
  } = useSmartPlaylistsView();

  if (selectedId) {
    return <SmartPlaylistDetail id={selectedId} />;
  }

  if (showSkeleton) {
    return <SmartPlaylistsViewSkeleton />;
  }

  if (showError) {
    return (
      <ViewEmptyState
        variant="error"
        title={t('errorTitle')}
        subtitle={t('errorSubtitle')}
        icon={AlertCircle}
        action={{ label: retryLabel, onClick: onRetry }}
      />
    );
  }

  const cards = sorted.map(p => <SmartPlaylistCard key={p.id} playlist={p} onOpen={onOpen} />);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PageHeader title={t('title')} icon={Sparkles} variant="section" />

      <div className="flex items-center justify-end px-6 py-3 shrink-0">
        <Button size="sm" onClick={onCreate} className="gap-1.5">
          <Plus className="size-4" />
          {t('newSmartPlaylist')}
        </Button>
      </div>

      {isEmpty ? (
        <ViewEmptyState
          title={t('emptyTitle')}
          subtitle={t('emptySubtitle')}
          icon={Sparkles}
          action={{ label: t('newSmartPlaylist'), onClick: onCreate }}
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 pb-6">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{cards}</div>
        </div>
      )}

      <SmartPlaylistFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
