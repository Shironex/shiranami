import { Skeleton } from '@/components/ui/skeleton';
import { useDownloadsViewSkeleton } from './DownloadsViewSkeleton.hooks';

export default function DownloadsViewSkeleton() {
  const { sections } = useDownloadsViewSkeleton();

  const sectionBlocks = sections.map(section => {
    const rows = section.rowKeys.map(rowKey => (
      <div key={rowKey} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-44 max-w-full" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="size-8 rounded-lg" />
      </div>
    ));
    return (
      <div key={section.key} className="flex flex-col gap-1.5">
        <Skeleton className="mx-1 h-3 w-20" />
        {rows}
      </div>
    );
  });

  return (
    <div
      className="flex-1 min-h-0 overflow-hidden px-6 pt-4 pb-6 flex flex-col gap-6"
      aria-busy="true"
    >
      {sectionBlocks}
    </div>
  );
}
