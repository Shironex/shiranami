import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore, type AppView } from '@/stores/useViewStore';
import type { Playlist } from '@/types/electron';
import { usePlaylistsQuery } from '@/hooks/queries/usePlaylists';
import {
  Library,
  Heart,
  History,
  ListMusic,
  Search,
  Radio,
  Settings,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  ListPlus,
  Sparkles,
} from 'lucide-react';
import { motion } from 'motion/react';
import { IconButton } from '@/components/ui/icon-button';
import { PlaylistContextMenu } from './PlaylistContextMenu';
import { SidebarPlaylistButton } from './SidebarPlaylistButton';
import type { ContextMenuPosition } from './TrackContextMenu';

const NAV_ITEMS: Array<{ id: AppView; key: string; icon: typeof Library }> = [
  { id: 'library', key: 'library', icon: Library },
  { id: 'playlists', key: 'playlists', icon: ListMusic },
  { id: 'favorites', key: 'favorites', icon: Heart },
  { id: 'history', key: 'history', icon: History },
  { id: 'mixes', key: 'mixes', icon: Sparkles },
  { id: 'search', key: 'search', icon: Search },
  { id: 'import-playlist', key: 'importPlaylist', icon: ListPlus },
  { id: 'radio', key: 'radio', icon: Radio },
  { id: 'settings', key: 'settings', icon: Settings },
];

export function Sidebar() {
  const { t } = useTranslation('sidebar');
  const activeView = useViewStore(s => s.activeView);
  const selectedPlaylistId = useViewStore(s => s.selectedPlaylistId);
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
  const sidebarHiddenItems = useUIStore(s => s.sidebarHiddenItems);
  const sidebarPlaylistsVisible = useUIStore(s => s.sidebarPlaylistsVisible);
  const navigateTo = useViewStore(s => s.navigateTo);
  const toggleSidebarCollapsed = useUIStore(s => s.toggleSidebarCollapsed);
  const version = useAppVersion();
  const { data: playlists = [], isLoading: isLoadingPlaylists } = usePlaylistsQuery();
  const [contextMenuState, setContextMenuState] = useState<{
    playlist: Playlist;
    position: ContextMenuPosition;
  } | null>(null);
  const handlePlaylistContextMenu = useCallback(
    (playlist: Playlist, position: ContextMenuPosition) => {
      setContextMenuState({ playlist, position });
    },
    []
  );
  const versionLabel = `v${version}`;
  const sidebarVersionLabel = sidebarCollapsed
    ? versionLabel
    : `${t('shiranami', { ns: 'common' })} ${versionLabel}`;

  return (
    <div
      className={cn(
        'shrink-0 flex flex-col h-full glass border-r border-border/50 transition-[width] duration-200',
        sidebarCollapsed ? 'w-[5.25rem]' : 'w-[12.5rem]'
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
            sidebarCollapsed ? 'justify-center w-9 h-9' : 'gap-2.5 min-w-0 flex-1'
          )}
          title={sidebarCollapsed ? t('library') : undefined}
          aria-label={t('openLibrary')}
        >
          <img
            src="./mascot.png"
            alt=""
            aria-hidden="true"
            className="w-7 h-7 rounded-lg object-cover shrink-0"
            draggable={false}
          />
          {!sidebarCollapsed && (
            <span className="font-display font-semibold text-sm text-foreground tracking-tight truncate">
              {t('shiranami', { ns: 'common' })}
            </span>
          )}
        </button>

        <IconButton
          size={sidebarCollapsed ? 'sm' : 'md'}
          onClick={toggleSidebarCollapsed}
          className="no-drag text-muted-foreground [&_svg]:size-4"
          aria-label={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
          title={sidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
        >
          {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <nav className={cn('py-2 shrink-0', sidebarCollapsed ? 'px-2' : 'px-3')}>
          <div className="space-y-0.5">
            {NAV_ITEMS.filter(item => !sidebarHiddenItems.includes(item.id)).map(item => {
              const isActive = activeView === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  title={sidebarCollapsed ? t(item.key) : undefined}
                  aria-label={t(item.key)}
                  data-view={item.id}
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
                      className="absolute inset-0 rounded-xl bg-primary/12 ring-1 ring-primary/35 shadow-[0_0_16px_-4px_rgba(var(--primary-rgb),0.45),inset_0_0_12px_-6px_rgba(var(--primary-rgb),0.4)]"
                      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10 shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="relative z-10 min-w-0 truncate">{t(item.key)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {sidebarPlaylistsVisible && (isLoadingPlaylists || playlists.length > 0) && (
          <div className={cn('min-h-0 flex flex-col pb-3', sidebarCollapsed ? 'px-2' : 'px-3')}>
            {sidebarCollapsed ? (
              <>
                <div className="min-h-0 overflow-y-auto scrollbar-thin space-y-1 pt-3">
                  {isLoadingPlaylists ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground/40">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : (
                    playlists.map(playlist => (
                      <SidebarPlaylistButton
                        key={playlist.id}
                        playlist={playlist}
                        collapsed
                        isActive={activeView === 'playlists' && selectedPlaylistId === playlist.id}
                        onNavigate={id => navigateTo('playlists', id)}
                        onContextMenu={handlePlaylistContextMenu}
                      />
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between px-2 pt-4 pb-2">
                  <p className="text-[10px] text-muted-foreground/40 font-medium tracking-wider uppercase">
                    {t('yourPlaylists')}
                  </p>
                  <button
                    onClick={() => navigateTo('playlists')}
                    className="text-[10px] text-primary/70 hover:text-primary transition-colors uppercase tracking-wider"
                  >
                    {t('all')}
                  </button>
                </div>

                <div className="min-h-0 overflow-y-auto scrollbar-thin pr-1 space-y-1">
                  {isLoadingPlaylists ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground/40">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : (
                    playlists.map(playlist => (
                      <SidebarPlaylistButton
                        key={playlist.id}
                        playlist={playlist}
                        collapsed={false}
                        isActive={activeView === 'playlists' && selectedPlaylistId === playlist.id}
                        onNavigate={id => navigateTo('playlists', id)}
                        onContextMenu={handlePlaylistContextMenu}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className={cn('py-4 border-t border-border/30', sidebarCollapsed ? 'px-2' : 'px-5')}>
        <p
          className={cn(
            'text-[10px] text-muted-foreground/40 font-medium tracking-wider uppercase',
            sidebarCollapsed && 'text-center'
          )}
          title={
            sidebarCollapsed ? `${t('shiranami', { ns: 'common' })} ${versionLabel}` : undefined
          }
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
