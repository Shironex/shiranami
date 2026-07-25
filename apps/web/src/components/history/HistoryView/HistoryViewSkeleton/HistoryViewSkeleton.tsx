import { Skeleton } from '@/components/ui/skeleton';
import { useHistoryViewSkeleton } from './HistoryViewSkeleton.hooks';

export default function HistoryViewSkeleton() {
  const { heroPillKeys, statCardKeys, panelRowKeys, listPanelKeys, recentRowKeys } =
    useHistoryViewSkeleton();

  const heroPills = heroPillKeys.map(key => (
    <Skeleton key={key} className="h-9 w-24 rounded-full" />
  ));

  const statCards = statCardKeys.map(key => (
    <div key={key} className="rounded-2xl border border-border/25 bg-background/35 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-20" />
      <Skeleton className="mt-2 h-3 w-28" />
    </div>
  ));

  const panelRows = panelRowKeys.map(key => (
    <div key={key} className="flex items-center gap-3 rounded-2xl border border-border/20 p-3">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  ));

  const listPanels = listPanelKeys.map(key => (
    <div key={key} className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
      <Skeleton className="h-5 w-36" />
      <div className="mt-4 space-y-3">{panelRows}</div>
    </div>
  ));

  const recentRows = recentRowKeys.map(key => (
    <div key={key} className="flex items-center gap-3 rounded-2xl border border-border/20 p-3">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  ));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-10 pt-6" aria-busy="true">
      <div className="rounded-[28px] border border-border/25 bg-surface/35 p-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-10 w-72 max-w-full" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
        <div className="mt-5 flex gap-2">{heroPills}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">{statCards}</div>
      <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-5 h-40 w-full rounded-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">{listPanels}</div>
      <div className="rounded-[24px] border border-border/25 bg-surface/30 p-4">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 space-y-3">{recentRows}</div>
      </div>
    </div>
  );
}
