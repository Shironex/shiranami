import { Skeleton } from '@/components/ui/skeleton';

export function MixesViewSkeleton() {
  // Lifted out of JSX (no-jsx-computation): build the placeholder rows above
  // the return, then render the ready-made array.
  const placeholderRows = Array.from({ length: 6 }).map((_, i) => (
    <div key={i} className="flex items-center gap-3.5 px-3 py-3 rounded-xl">
      <Skeleton className="size-12 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="h-3 w-16" />
    </div>
  ));

  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <div className="px-6 pt-2 pb-4 shrink-0">
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="space-y-1.5">{placeholderRows}</div>
      </div>
    </div>
  );
}
