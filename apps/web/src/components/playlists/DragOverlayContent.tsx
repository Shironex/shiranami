import { GripVertical, Play } from 'lucide-react';
import { formatDuration } from '@shiranami/shared';
import type { Track } from '@/stores/types';

/** Overlay shown while dragging — matches SortableTrackRow layout */
export function DragOverlayContent({ track }: { track: Track }) {
  return (
    <div className="px-0.5">
      <div className="w-full flex items-center gap-1.5 px-1.5 h-[48px] rounded-xl bg-accent text-foreground">
        <div className="shrink-0 p-0.5 text-muted-foreground/40">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-surface">
            {track.albumArt ? (
              <img
                src={track.albumArt}
                alt={track.title}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <Play className="w-3.5 h-3.5 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{track.title}</p>
            <p className="text-xs text-muted-foreground/60 truncate">{track.artist}</p>
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 font-medium">
          {track.duration > 0 ? formatDuration(track.duration) : ''}
        </span>
      </div>
    </div>
  );
}
