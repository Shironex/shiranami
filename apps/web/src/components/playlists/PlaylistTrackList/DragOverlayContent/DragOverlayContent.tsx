import { GripVertical, Play } from 'lucide-react';
import { useDragOverlayContent } from './DragOverlayContent.hooks';
import type { IDragOverlayContentProps } from './DragOverlayContent.types';

/** Overlay shown while dragging — matches SortableTrackRow layout */
export default function DragOverlayContent(props: IDragOverlayContentProps) {
  const { title, artist, albumArt, hasAlbumArt, durationLabel } = useDragOverlayContent(props);

  return (
    <div className="px-0.5">
      <div className="w-full flex items-center gap-1.5 px-1.5 h-[48px] rounded-xl bg-accent text-foreground">
        <div className="shrink-0 p-0.5 text-muted-foreground/40">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden bg-surface">
            {hasAlbumArt ? (
              <img src={albumArt} alt={title} className="w-full h-full object-cover rounded-lg" />
            ) : (
              <Play className="w-3.5 h-3.5 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{title}</p>
            <p className="text-xs text-muted-foreground/60 truncate">{artist}</p>
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0 font-medium">
          {durationLabel}
        </span>
      </div>
    </div>
  );
}
