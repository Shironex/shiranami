import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';

export function SmartPlaylistsViewSkeleton() {
  const { t } = useTranslation('smartPlaylists');

  const placeholderCards = Array.from({ length: 6 }).map((_, i) => (
    <div
      key={i}
      className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/50 p-3"
    >
      <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  ));

  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <span className="sr-only" role="status">
        {t('title')}
      </span>
      <PageHeader title={t('title')} icon={Sparkles} variant="section" />

      <div className="flex items-center justify-end px-6 py-3 shrink-0">
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{placeholderCards}</div>
      </div>
    </div>
  );
}
