import { Skeleton } from '@/components/ui/skeleton';
import { useDownloadsSectionSkeleton } from './DownloadsSectionSkeleton.hooks';

/**
 * Placeholder for one download tool's block — the status row, the binary path
 * panel, the installed/latest version pair, and the hint line beneath them.
 */
function ToolCardSkeleton() {
  return (
    <div className="space-y-3">
      {/* ToolStatusRow skeleton */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-background/50 border border-border/20">
        <Skeleton className="size-4 shrink-0 rounded-sm" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>

      {/* Binary path skeleton */}
      <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20 space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      {/* ToolVersionBlock skeleton */}
      <div className="px-3 py-2 rounded-xl bg-background/50 border border-border/20 space-y-2.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      </div>

      {/* Hint text skeleton */}
      <Skeleton className="h-3 w-48 mx-1" />
    </div>
  );
}

/**
 * Placeholder for the download-location panel — the label/badge line, the
 * resolved path, and the change/reset button pair.
 */
function DownloadLocationSkeleton() {
  return (
    <div className="px-3 py-3 rounded-xl bg-background/50 border border-border/20 space-y-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-52" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export default function DownloadsSectionSkeleton() {
  useDownloadsSectionSkeleton();

  return (
    <div className="space-y-3">
      {/* yt-dlp card */}
      <ToolCardSkeleton />

      {/* Download location */}
      <DownloadLocationSkeleton />

      {/* Divider */}
      <div className="border-t border-border/20 pt-3 mt-3" />

      {/* ffmpeg card */}
      <ToolCardSkeleton />
    </div>
  );
}
