import { cn } from '@/lib/utils';
import { IS_MAC } from '@/lib/platform';
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '@/stores/usePanelSizeStore';
import { PanelResizeHandle } from '@/components/shared/PanelResizeHandle';
import { PlaylistContextMenu } from '@/components/shared/PlaylistContextMenu';
import { SidebarPlaylistButton } from '@/components/shared/SidebarPlaylistButton';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSidebar } from './Sidebar.hooks';

export default function Sidebar() {
  const {
    t,
    activeView,
    selectedPlaylistId,
    sidebarCollapsed,
    sidebarWidth,
    isResizing,
    visibleNavItems,
    playlists,
    isLoadingPlaylists,
    showPlaylistsSection,
    sidebarVersionLabel,
    fullVersionLabel,
    contextMenuState,
    navigateTo,
    onOpenHome,
    toggleSidebarCollapsed,
    setSidebarWidth,
    resetSidebarWidth,
    setIsResizing,
    onPlaylistContextMenu,
    onCloseContextMenu,
  } = useSidebar();

  const reducedMotion = useReducedMotion();

  const navButtons = visibleNavItems.map(item => {
    const isActive = activeView === item.id;
    const Icon = item.Icon;

    return (
      <button
        key={item.id}
        onClick={() => navigateTo(item.id)}
        title={sidebarCollapsed ? t(item.key) : undefined}
        aria-label={t(item.key)}
        aria-current={isActive ? 'page' : undefined}
        data-view={item.id}
        className={cn(
          'group w-full flex items-center rounded-xl text-sm font-medium transition-all duration-200 relative',
          'active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
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
        <Icon
          className={cn(
            'w-4 h-4 relative z-10 shrink-0',
            !reducedMotion && 'transition-transform duration-200 group-hover:scale-110'
          )}
        />
        <span
          className={cn(
            'relative z-10 min-w-0 truncate',
            !reducedMotion && 'transition-[opacity,transform] duration-200',
            sidebarCollapsed ? 'w-0 -translate-x-1 opacity-0' : 'w-auto translate-x-0 opacity-100'
          )}
          aria-hidden={sidebarCollapsed ? true : undefined}
        >
          {t(item.key)}
        </span>
      </button>
    );
  });

  const collapsedPlaylistButtons = playlists.map(playlist => (
    <SidebarPlaylistButton
      key={playlist.id}
      playlist={playlist}
      collapsed
      isActive={activeView === 'playlists' && selectedPlaylistId === playlist.id}
      onNavigate={id => navigateTo('playlists', id)}
      onContextMenu={onPlaylistContextMenu}
    />
  ));

  const expandedPlaylistButtons = playlists.map(playlist => (
    <SidebarPlaylistButton
      key={playlist.id}
      playlist={playlist}
      collapsed={false}
      isActive={activeView === 'playlists' && selectedPlaylistId === playlist.id}
      onNavigate={id => navigateTo('playlists', id)}
      onContextMenu={onPlaylistContextMenu}
    />
  ));

  const collapsedPlaylistSkeletons = [0, 1, 2, 3].map(n => (
    <div key={n} className="flex justify-center px-0 py-2">
      <Skeleton className="w-9 h-9 rounded-lg" />
    </div>
  ));

  const expandedPlaylistSkeletons = [0, 1, 2, 3].map(n => (
    <div key={n} className="flex items-center gap-2 px-2 py-2">
      <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
      <Skeleton className="h-3 w-24 rounded" />
    </div>
  ));

  return (
    <div
      className={cn(
        // `relative z-10` gives the sidebar its own stacking context so its
        // opaque glass background always paints ABOVE the fixed `z-0`
        // ThemeBackground image. Without it the sidebar is position:static and,
        // in low-performance mode (where the override drops `backdrop-filter`
        // and with it the stacking context blur used to create), the theme
        // image paints over the sidebar and washes the nav chrome out.
        'app-sidebar relative z-10 shrink-0 flex flex-col h-full glass border-r border-border/50',
        // Suspend the width transition while dragging so the panel tracks the
        // pointer 1:1 instead of easing behind it.
        !isResizing && 'transition-[width] duration-200',
        sidebarCollapsed && 'w-[5.25rem]'
      )}
      style={sidebarCollapsed ? undefined : { width: sidebarWidth }}
      id="app-sidebar"
    >
      {!sidebarCollapsed && (
        <PanelResizeHandle
          edge="right"
          value={sidebarWidth}
          min={SIDEBAR_WIDTH_MIN}
          max={SIDEBAR_WIDTH_MAX}
          onChange={setSidebarWidth}
          onReset={resetSidebarWidth}
          onDraggingChange={setIsResizing}
          aria-label={t('resizeSidebar')}
          aria-controls="app-sidebar"
        />
      )}
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
          onClick={onOpenHome}
          className={cn(
            'no-drag flex items-center rounded-xl text-left transition-colors',
            sidebarCollapsed ? 'justify-center w-9 h-9' : 'gap-2.5 min-w-0 flex-1'
          )}
          title={sidebarCollapsed ? t('shiranami', { ns: 'common' }) : undefined}
          aria-label={t('openHome')}
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
          <div className="space-y-0.5">{navButtons}</div>
        </nav>

        {showPlaylistsSection && (
          <div className={cn('min-h-0 flex flex-col pb-3', sidebarCollapsed ? 'px-2' : 'px-3')}>
            {sidebarCollapsed ? (
              <div className="min-h-0 overflow-y-auto scrollbar-thin space-y-1 pt-3">
                {isLoadingPlaylists ? collapsedPlaylistSkeletons : collapsedPlaylistButtons}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-2 pt-4 pb-2">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
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
                  {isLoadingPlaylists ? expandedPlaylistSkeletons : expandedPlaylistButtons}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className={cn('py-4 border-t border-border/30', sidebarCollapsed ? 'px-2' : 'px-5')}>
        <p
          className={cn(
            'font-mono text-[0.65rem] uppercase tracking-[0.18em] tabular-nums text-muted-foreground',
            sidebarCollapsed && 'text-center'
          )}
          title={sidebarCollapsed ? fullVersionLabel : undefined}
        >
          {sidebarVersionLabel}
        </p>
      </div>

      {contextMenuState && (
        <PlaylistContextMenu
          playlist={contextMenuState.playlist}
          position={contextMenuState.position}
          onClose={onCloseContextMenu}
        />
      )}
    </div>
  );
}
