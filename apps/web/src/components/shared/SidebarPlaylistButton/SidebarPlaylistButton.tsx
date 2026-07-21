import { ListMusic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarPlaylistButton } from './SidebarPlaylistButton.hooks';
import type { ISidebarPlaylistButtonProps } from './SidebarPlaylistButton.types';

/**
 * A single playlist row in the sidebar. Collapses the two near-identical
 * collapsed/expanded blocks into one component driven by `collapsed`: the only
 * differences are layout (centered vs gap+label), thumb size (w-9 vs w-8), and
 * whether the name renders inline or is exposed via title/aria-label.
 *
 * Playlist rows keep the flat `bg-accent` active treatment on purpose — the
 * accent glow is reserved for the active top-level nav item.
 */
export default function SidebarPlaylistButton(props: ISidebarPlaylistButtonProps) {
  const { playlist, collapsed, isActive, onNavigate, onContextMenu } =
    useSidebarPlaylistButton(props);

  return (
    <button
      type="button"
      onClick={() => onNavigate(playlist.id)}
      onContextMenu={onContextMenu}
      title={collapsed ? playlist.name : undefined}
      aria-label={collapsed ? playlist.name : undefined}
      className={cn(
        'w-full flex items-center rounded-xl transition-colors',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
        collapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2 py-2 text-left',
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
      )}
    >
      <div
        className={cn(
          'rounded-lg bg-muted/30 border border-border/20 overflow-hidden shrink-0 flex items-center justify-center',
          collapsed ? 'w-9 h-9' : 'w-8 h-8'
        )}
      >
        {playlist.coverArt ? (
          <img
            src={playlist.coverArt}
            alt={playlist.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <ListMusic className="w-4 h-4 text-muted-foreground/30" />
        )}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{playlist.name}</p>
        </div>
      )}
    </button>
  );
}
