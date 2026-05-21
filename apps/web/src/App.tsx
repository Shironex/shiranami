import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { PLAYER_BAR_HEIGHT, VISUALIZER_HEIGHT, PLAYER_BAR_PLUS_VIZ } from '@/lib/layout';
import { Sidebar } from '@/components/shared/Sidebar';
import { TopBar } from '@/components/shared/TopBar';
import { SplashScreen } from '@/components/splash/SplashScreen';
import { PlayerBar } from '@/components/player';
import { VISUALIZER_COMPONENTS } from '@/components/player/visualizerRegistry';
import { CompactPlayer } from '@/components/player/CompactPlayer';
import { MediaSessionSync } from '@/components/player/MediaSessionSync';
import { LibraryView } from '@/components/library/LibraryView';
import { FavoritesView } from '@/components/favorites/FavoritesView';
import { PlaylistsView } from '@/components/playlists/PlaylistsView';
import { AmbientBackground } from '@/components/shared/AmbientBackground';
import { ThemeBackground } from '@/components/shared/ThemeBackground';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

const SettingsView = lazy(() => import('@/components/settings/SettingsView'));
const SearchView = lazy(() => import('@/components/search/SearchView'));
const HistoryView = lazy(() => import('@/components/history/HistoryView'));
const RadioView = lazy(() => import('@/components/radio/RadioView'));
const MixesView = lazy(() => import('@/components/mixes/MixesView'));
const PlaylistImportView = lazy(() => import('@/components/playlist-import/PlaylistImportView'));
const NowPlayingView = lazy(() => import('@/components/now-playing/NowPlayingView'));
const PlaylistDetailView = lazy(() => import('@/components/playlists/PlaylistDetailView'));
const LyricsPanel = lazy(() => import('@/components/lyrics/LyricsPanel'));
const QueuePanel = lazy(() => import('@/components/player/QueuePanel'));
// Dev-only: the import expression is dead code in prod (the ternary collapses
// to `null`), so Rollup never emits the chunk for a production build.
const DebugOverlay = import.meta.env.DEV
  ? lazy(() => import('@/components/debug/DebugOverlay').then(m => ({ default: m.DebugOverlay })))
  : null;
const KeyboardShortcutsHelp = lazy(() => import('@/components/shared/KeyboardShortcutsHelp'));
const ShareDialogManager = lazy(() => import('@/components/shared/ShareDialogManager'));
const TrackEnrichDialogManager = lazy(() => import('@/components/shared/TrackEnrichDialogManager'));
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useLibrarySync } from '@/hooks/useLibrarySync';
import { usePlayerPreferences } from '@/hooks/usePlayerPreferences';
import { usePlaybackResume } from '@/hooks/usePlaybackResume';
import { useUpdateNotifications } from '@/hooks/useUpdateNotifications';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useDebugPanel } from '@/hooks/useDebugPanel';
import { DevProfiler } from '@/components/debug/DevProfiler';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useViewStore } from '@/stores/useViewStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { AmbientColorProvider } from '@/hooks/useAmbientColor';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { hydrateLanguageFromStore } from '@/lib/i18n';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDismissed = useCallback(() => setSplashDone(true), []);

  const { t } = useTranslation();

  useAudioEngine();
  useMediaSession();
  usePlayerPreferences();
  const {
    isLoading: libraryLoading,
    isError: libraryError,
    refetch: refetchLibrary,
  } = useLibrarySync();
  usePlaybackResume(splashDone);

  useEffect(() => {
    if (!libraryError) return;
    toast.error(t('failedLoadLibrary', { ns: 'toast' }), {
      id: 'library-load-error',
      action: {
        label: t('retry', { ns: 'common' }),
        onClick: () => {
          void refetchLibrary();
        },
      },
    });
  }, [libraryError, refetchLibrary, t]);
  useUpdateNotifications();
  useKeyboardShortcuts();
  const debugOpen = useDebugPanel();

  useEffect(() => {
    hydrateLanguageFromStore();
  }, []);

  // Auto-collapse sidebar on narrow viewports
  const setSidebarCollapsed = useUIStore(s => s.setSidebarCollapsed);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 900px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setSidebarCollapsed(true);
    };
    handleChange(mql);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [setSidebarCollapsed]);

  const { handleOpenFile, handleOpenFolder, isScanning } = useLibraryActions();
  const currentTrack = usePlaybackStore(s => s.currentTrack);
  const activeView = useViewStore(s => s.activeView);
  const rightPanel = useViewStore(s => s.rightPanel);
  const selectedPlaylistId = useViewStore(s => s.selectedPlaylistId);
  const showVisualizer = useUIStore(s => s.showVisualizer);
  const visualizerStyle = useUIStore(s => s.visualizerStyle);
  const Visualizer = VISUALIZER_COMPONENTS[visualizerStyle];
  const compactMode = useCompactStore(s => s.compactMode);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const updateDependencyInstall = useDownloadStore(s => s.updateDependencyInstall);
  const updateEnrichProgress = useMetadataEnrichStore(s => s.updateProgress);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onDependencyInstallProgress(progress => {
      updateDependencyInstall(progress);
    });
    return cleanup;
  }, [updateDependencyInstall]);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.metadata.onEnrichProgress(progress => {
      updateEnrichProgress(progress);
    });
    return cleanup;
  }, [updateEnrichProgress]);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.library.onScanProgress(p => {
      useLibraryStore.getState().updateScanProgress(p);
    });
    return cleanup;
  }, []);

  return (
    <>
      {/* Isolated leaf: owns the currentTime media-session side-effects so the
          root App tree does not re-render on every 250ms time tick. */}
      <MediaSessionSync />

      <SplashScreen
        isLoading={libraryLoading}
        isError={libraryError}
        onDismissed={handleSplashDismissed}
      />

      {splashDone && (
        <AmbientColorProvider>
          <div
            className={cn(
              'h-screen w-screen bg-background text-foreground overflow-hidden relative',
              !compactMode && 'flex',
              IS_ELECTRON && 'rounded-t-[10px]'
            )}
          >
            <ThemeBackground />
            <AmbientBackground />
            <CommandPalette />
            {debugOpen && DebugOverlay && (
              <Suspense fallback={null}>
                <DebugOverlay />
              </Suspense>
            )}
            <ErrorBoundary viewName="KeyboardShortcutsHelp">
              <Suspense fallback={null}>
                <KeyboardShortcutsHelp />
              </Suspense>
            </ErrorBoundary>
            <ErrorBoundary viewName="ShareDialogManager">
              <Suspense fallback={null}>
                <ShareDialogManager />
              </Suspense>
            </ErrorBoundary>
            <ErrorBoundary viewName="TrackEnrichDialogManager">
              <Suspense fallback={null}>
                <TrackEnrichDialogManager />
              </Suspense>
            </ErrorBoundary>

            {compactMode ? (
              <CompactPlayer />
            ) : (
              <>
                {/* Skip to content link for keyboard users */}
                <a
                  href="#main-content"
                  className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium"
                >
                  Skip to main content
                </a>

                {/* Sidebar */}
                <Sidebar />

                {/* Main content area */}
                <div className="flex-1 flex flex-col min-w-0 relative">
                  <TopBar
                    onAddFile={handleOpenFile}
                    onAddFolder={handleOpenFolder}
                    isScanning={isScanning}
                  />

                  <main
                    id="main-content"
                    aria-label={activeView}
                    className="flex-1 flex overflow-hidden min-h-0"
                    style={{
                      paddingBottom:
                        activeView === 'now-playing'
                          ? undefined
                          : currentTrack && showVisualizer && !lowPerformanceMode
                            ? PLAYER_BAR_PLUS_VIZ
                            : currentTrack
                              ? PLAYER_BAR_HEIGHT
                              : undefined,
                    }}
                  >
                    {/* Center content */}
                    <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
                      {activeView === 'library' && (
                        <ErrorBoundary viewName="LibraryView">
                          <DevProfiler id="library">
                            <LibraryView />
                          </DevProfiler>
                        </ErrorBoundary>
                      )}
                      {activeView === 'playlists' && (
                        <ErrorBoundary viewName="PlaylistsView">
                          {selectedPlaylistId ? (
                            <Suspense fallback={null}>
                              <PlaylistDetailView />
                            </Suspense>
                          ) : (
                            <PlaylistsView />
                          )}
                        </ErrorBoundary>
                      )}
                      {activeView === 'favorites' && (
                        <ErrorBoundary viewName="FavoritesView">
                          <FavoritesView />
                        </ErrorBoundary>
                      )}
                      {activeView === 'history' && (
                        <ErrorBoundary viewName="HistoryView">
                          <Suspense fallback={null}>
                            <HistoryView />
                          </Suspense>
                        </ErrorBoundary>
                      )}
                      {activeView === 'mixes' && (
                        <ErrorBoundary viewName="MixesView">
                          <Suspense fallback={null}>
                            <MixesView />
                          </Suspense>
                        </ErrorBoundary>
                      )}
                      {activeView === 'search' && (
                        <ErrorBoundary viewName="SearchView">
                          <Suspense fallback={null}>
                            <SearchView />
                          </Suspense>
                        </ErrorBoundary>
                      )}
                      {activeView === 'import-playlist' && (
                        <ErrorBoundary viewName="PlaylistImportView">
                          <Suspense fallback={null}>
                            <PlaylistImportView />
                          </Suspense>
                        </ErrorBoundary>
                      )}
                      {activeView === 'radio' && (
                        <ErrorBoundary viewName="RadioView">
                          <Suspense fallback={null}>
                            <RadioView />
                          </Suspense>
                        </ErrorBoundary>
                      )}
                      {activeView === 'now-playing' && (
                        <ErrorBoundary viewName="NowPlayingView">
                          <Suspense fallback={null}>
                            <NowPlayingView />
                          </Suspense>
                        </ErrorBoundary>
                      )}
                      {activeView === 'settings' && (
                        <ErrorBoundary viewName="SettingsView">
                          <Suspense fallback={null}>
                            <SettingsView />
                          </Suspense>
                        </ErrorBoundary>
                      )}
                    </div>

                    {/* Right panel (hidden in now-playing view — lyrics are inline) */}
                    {currentTrack &&
                      activeView !== 'now-playing' &&
                      (rightPanel === 'lyrics' || rightPanel === 'queue') && (
                        <div className="w-[320px] border-l border-border/30 shrink-0 flex flex-col overflow-hidden bg-surface/30">
                          <ErrorBoundary viewName="RightPanel">
                            <Suspense fallback={null}>
                              {rightPanel === 'lyrics' ? <LyricsPanel /> : <QueuePanel />}
                            </Suspense>
                          </ErrorBoundary>
                        </div>
                      )}
                  </main>

                  {/* Visualizer strip above player bar (hidden in now-playing view and in low performance mode) */}
                  {currentTrack &&
                    showVisualizer &&
                    !lowPerformanceMode &&
                    activeView !== 'now-playing' && (
                      <div
                        className="absolute left-0 right-0 z-40"
                        style={{ bottom: PLAYER_BAR_HEIGHT, height: VISUALIZER_HEIGHT }}
                      >
                        <ErrorBoundary viewName="Visualizer">
                          <Suspense fallback={null}>
                            <DevProfiler id="visualizer">
                              <Visualizer />
                            </DevProfiler>
                          </Suspense>
                        </ErrorBoundary>
                      </div>
                    )}

                  {/* Player bar (hidden in now-playing view — controls are inline) */}
                  {activeView !== 'now-playing' && (
                    <DevProfiler id="player">
                      <PlayerBar />
                    </DevProfiler>
                  )}
                </div>
              </>
            )}
          </div>
        </AmbientColorProvider>
      )}
    </>
  );
}

export default App;
