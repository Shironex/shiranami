import { Skeleton } from '@/components/ui/skeleton';
import { usePlaylistsViewSkeleton } from './PlaylistsViewSkeleton.hooks';

/** Loading placeholder mirroring the playlists grid (header row + card grid). */
export default function PlaylistsViewSkeleton() {
  const { placeholderKeys } = usePlaylistsViewSkeleton();

  // Lifted out of JSX (no-jsx-computation): build the placeholder cards above
  // the return, then render the ready-made array.
  const placeholderCards = placeholderKeys.map(key => (
    <div key={key} className="rounded-2xl p-4 border border-border/30 bg-surface/60">
      <Skeleton className="aspect-square w-full rounded-xl mb-3" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2 mt-1" />
    </div>
  ));

  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <div className="px-6 pt-2 pb-4 shrink-0 flex items-center gap-3">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>
      <div className="flex-1 overflow-hidden px-6 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {placeholderCards}
        </div>
      </div>
    </div>
  );
}
