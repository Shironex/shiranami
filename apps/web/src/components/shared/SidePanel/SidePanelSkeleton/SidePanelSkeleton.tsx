import { Skeleton } from '@/components/ui/skeleton';
import { useSidePanelSkeleton } from './SidePanelSkeleton.hooks';

/**
 * Suspense fallback for the lazily loaded lyrics/queue panels — mirrors the
 * panel chrome (header strip + a column of track-shaped rows) so the docked
 * frame doesn't flash empty while a panel chunk loads.
 */
export default function SidePanelSkeleton() {
  const { rowKeys } = useSidePanelSkeleton();

  // Lifted out of JSX (no-jsx-computation): build the rows above the return.
  const rows = rowKeys.map(key => (
    <div key={key} className="flex items-center gap-3 px-2 py-1.5">
      <Skeleton className="size-9 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/2 mt-1.5" />
      </div>
    </div>
  ));

  return (
    <div className="flex flex-col h-full" aria-busy="true">
      <div className="px-5 py-2 min-h-[49px] border-b border-border/20 shrink-0 flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="size-7 rounded-lg" />
      </div>
      <div className="px-3 py-3 flex flex-col gap-1">{rows}</div>
    </div>
  );
}
