import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useAppStore, type AppView } from '@/stores/useAppStore';
import type { Playlist } from '@/types/electron';
import { subscribeToPlaylistChanges } from '@/lib/playlists';
import {
  Library,
  Heart,
  ListMusic,
  Search,
  Radio,
  Settings,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { motion } from 'motion/react';
import { PlaylistContextMenu } from './PlaylistContextMenu';
import type { ContextMenuPosition } from './TrackContextMenu';

const NAV_ITEMS: Array<{ id: AppView; label: string; icon: typeof Library }> = [
  { id: 'library', label: 'Library', icon: Library },
  { id: 'playlists', label: 'Playlists', icon: ListMusic },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const activeView = useAppStore((s) => s.activeView);
  const selectedPlaylistId = useAppStore((s) => s.selectedPlaylistId);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const navigateTo = useAppStore((s) => s.navigateTo);
  const toggleSidebarCollapsed = useAppStore((s) => s.toggleSidebarCollapsed);
  const version = useAppVersion();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const [contextMenuState, setContextMenuState] = useState<{
    playlist: Playlist;
    position: ContextMenuPosition;
  } | null>(null);
  const versionLabel = `v${version}`;
  const sidebarVersionLabel = sidebarCollapsed ? versionLabel : `Shiranami ${versionLabel}`;

  const loadPlaylists = useCallback(async () => {
    try {
      const result = (await window.electronAPI.db.playlists.getAll()) as Playlist[];
      setPlaylists(result);
    } catch {
      setPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
    return subscribeToPlaylistChanges(loadPlaylists);
  }, [loadPlaylists]);

  return (
    <div
      className={cn(
        'shrink-0 flex flex-col h-full bg-sidebar border-r border-border/50 transition-[width] duration-200',
        sidebarCollapsed ? 'w-[84px]' : 'w-[200px]'
      )}
    >
      <div
        className={cn(
          'drag flex shrink-0',
          sidebarCollapsed
            ? 'h-[92px] flex-col items-center justify-center gap-1.5 px-2'
            : 'h-14 items-center px-5 gap-2.5',
          IS_MAC && 'pt-8'
        )}
      >
        <button
          onClick={() => navigateTo('library')}
          className={cn(
            'no-drag flex items-center rounded-xl text-left transition-colors',
            sidebarCollapsed ? 'justify-center w-9 h-9' : 'gap-2.5'
          )}
          title={sidebarCollapsed ? 'Library' : undefined}
          aria-label="Open library"
        >
          <img
            src="./mascot.png"
            alt=""
            className="w-7 h-7 rounded-lg object-cover"
            draggable={false}
          />
          {!sidebarCollapsed && (
            <span className="font-display font-semibold text-sm text-foreground tracking-tight">
              Shiranami
            </span>
          )}
        </button>

        <button
          onClick={toggleSidebarCollapsed}
          className={cn(
            'no-drag rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            sidebarCollapsed ? 'w-7 h-7' : 'w-8 h-8'
          )}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <nav className={cn('py-2 shrink-0', sidebarCollapsed ? 'px-2' : 'px-3')}>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = activeView === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={cn(
                    'w-full flex items-center rounded-xl text-sm font-medium transition-all duration-200 relative',
                    sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-accent rounded-xl"
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10" />
                  {!sidebarCollapsed && <span className="relative z-10">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {(isLoadingPlaylists || playlists.length > 0) && (
          <div className={cn('min-h-0 flex flex-col pb-3', sidebarCollapsed ? 'px-2' : 'px-3')}>
            {sidebarCollapsed ? (
              <>
                <div className="flex items-center justify-center pt-4 pb-2">
                  <button
                    onClick={() => navigateTo('playlists')}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="All playlists"
                    aria-label="All playlists"
                  >
                    <ListMusic className="w-4 h-4" />
                  </button>
                </div>
                <div className="min-h-0 overflow-y-auto scrollbar-thin space-y-1">
                  {isLoadingPlaylists ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground/40">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : (
                    playlists.map((playlist) => {
                      const isPlaylistActive =
                        activeView === 'playlists' && selectedPlaylistId === playlist.id;

                      return (
                        <button
                          key={playlist.id}
                          onClick={() => navigateTo('playlists', playlist.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setContextMenuState({
                              playlist,
                              position: { x: event.clientX, y: event.clientY },
                            });
                          }}
                          title={playlist.name}
                          aria-label={playlist.name}
                          className={cn(
                            'w-full flex items-center justify-center px-0 py-2 rounded-xl transition-colors',
                            isPlaylistActive
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
                          )}
                        >
                          <div className="w-9 h-9 rounded-lg bg-muted/30 border border-border/20 overflow-hidden shrink-0 flex items-center justify-center">
                            {playlist.coverArt ? (
                              <img
                                src={playlist.coverArt}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ListMusic className="w-4 h-4 text-muted-foreground/30" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-2 pt-4 pb-2">
                  <p className="text-[10px] text-muted-foreground/40 font-medium tracking-wider uppercase">
                    Your Playlists
                  </p>
                  <button
                    onClick={() => navigateTo('playlists')}
                    className="text-[10px] text-primary/70 hover:text-primary transition-colors uppercase tracking-wider"
                  >
                    All
                  </button>
                </div>

                <div className="min-h-0 overflow-y-auto scrollbar-thin pr-1 space-y-1">
                  {isLoadingPlaylists ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground/40">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : (
                    playlists.map((playlist) => {
                      const isPlaylistActive =
                        activeView === 'playlists' && selectedPlaylistId === playlist.id;

                      return (
                        <button
                          key={playlist.id}
                          onClick={() => navigateTo('playlists', playlist.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setContextMenuState({
                              playlist,
                              position: { x: event.clientX, y: event.clientY },
                            });
                          }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-2 rounded-xl text-left transition-colors',
                            isPlaylistActive
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent/70'
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg bg-muted/30 border border-border/20 overflow-hidden shrink-0 flex items-center justify-center">
                            {playlist.coverArt ? (
                              <img
                                src={playlist.coverArt}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ListMusic className="w-4 h-4 text-muted-foreground/30" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{playlist.name}</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          'py-4 border-t border-border/30',
          sidebarCollapsed ? 'px-2' : 'px-5'
        )}
      >
        <p
          className={cn(
            'text-[10px] text-muted-foreground/40 font-medium tracking-wider uppercase',
            sidebarCollapsed && 'text-center'
          )}
          title={sidebarCollapsed ? `Shiranami ${versionLabel}` : undefined}
        >
          {sidebarVersionLabel}
        </p>
      </div>

      {contextMenuState && (
        <PlaylistContextMenu
          playlist={contextMenuState.playlist}
          position={contextMenuState.position}
          onClose={() => setContextMenuState(null)}
        />
      )}
    </div>
  );
}
