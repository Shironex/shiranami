import { Skeleton } from '@/components/ui/skeleton';

export function LibraryViewSkeleton() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-20 rounded-xl" />
        </div>
      </div>
      <div className="flex-1 min-h-0 px-4 space-y-1">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 h-[52px]">
            <Skeleton className="size-9 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}
