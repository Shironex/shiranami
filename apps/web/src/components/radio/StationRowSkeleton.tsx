import { Skeleton } from '@/components/ui/skeleton';

export const RADIO_SKELETON_ROWS = 10;

export function StationRowSkeleton() {
  return (
    <div className="px-0.5">
      <div className="flex h-[52px] items-center gap-3 rounded-xl px-3">
        <Skeleton className="size-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <Skeleton className="h-3 w-5 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
        <Skeleton className="size-7 shrink-0 rounded-md" />
      </div>
    </div>
  );
}
