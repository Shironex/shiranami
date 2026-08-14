import { ListPlus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlaylistPickerContent } from '@/components/shared/PlaylistPickerContent';
import { usePlaylistSubmenu } from './PlaylistSubmenu.hooks';
import type { IPlaylistSubmenuProps } from './PlaylistSubmenu.types';

/**
 * The "Add to Playlist" row of the track context menu and its fly-out. The row
 * is a roving menuitem: hover opens the panel (with a grace period on
 * mouse-leave so the pointer can travel into it), and Enter/Space/ArrowRight
 * open it from the keyboard while ArrowLeft closes it again. The panel flips
 * to the left when the row sits too close to the right edge of the viewport.
 */
export default function PlaylistSubmenu(props: IPlaylistSubmenuProps) {
  const {
    label,
    trackIds,
    onClose,
    parentRef,
    rowRef,
    submenuRef,
    isSubmenuOpen,
    submenuClassName,
    onMouseEnter,
    onMouseLeave,
    onRowKeyDown,
  } = usePlaylistSubmenu(props);

  return (
    <div
      ref={parentRef}
      className="relative"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        ref={rowRef}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={isSubmenuOpen}
        onKeyDown={onRowKeyDown}
        onMouseEnter={event => event.currentTarget.focus({ preventScroll: true })}
        className={cn(
          'focus-ring w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left cursor-default',
          'text-foreground/80 hover:text-foreground hover:bg-accent focus:text-foreground focus:bg-accent'
        )}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
          <ListPlus className="w-4 h-4" />
        </span>
        {label}
        <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />
      </button>

      {isSubmenuOpen && (
        <div ref={submenuRef} className={submenuClassName}>
          <PlaylistPickerContent trackIds={trackIds} onDone={onClose} />
        </div>
      )}
    </div>
  );
}
