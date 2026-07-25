import { ListPlus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlaylistPickerContent } from '@/components/shared/PlaylistPickerContent';
import { usePlaylistSubmenu } from './PlaylistSubmenu.hooks';
import type { IPlaylistSubmenuProps } from './PlaylistSubmenu.types';

/**
 * The "Add to Playlist" row of the track context menu and its hover fly-out.
 * The panel flips to the left when the row sits too close to the right edge of
 * the viewport, and a short grace period on mouse-leave keeps it open while the
 * pointer travels from the row into the panel.
 */
export default function PlaylistSubmenu(props: IPlaylistSubmenuProps) {
  const {
    label,
    trackIds,
    onClose,
    parentRef,
    submenuRef,
    isSubmenuOpen,
    submenuClassName,
    onMouseEnter,
    onMouseLeave,
  } = usePlaylistSubmenu(props);

  return (
    <div
      ref={parentRef}
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left cursor-default',
          'text-foreground/80 hover:text-foreground hover:bg-accent'
        )}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
          <ListPlus className="w-4 h-4" />
        </span>
        {label}
        <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />
      </div>

      {isSubmenuOpen && (
        <div ref={submenuRef} className={submenuClassName}>
          <PlaylistPickerContent trackIds={trackIds} onDone={onClose} />
        </div>
      )}
    </div>
  );
}
