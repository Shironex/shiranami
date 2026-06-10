import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { IS_ELECTRON, IS_E2E } from '@/lib/platform';
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
import { SupportBanner } from '@/components/shared/SupportBanner';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

const OverviewView = lazy(() => import('@/components/overview/OverviewView'));
const SettingsView = lazy(() => import('@/components/settings/SettingsView'));
const SearchView = lazy(() => import('@/components/search/SearchView'));
const HistoryView = lazy(() => import('@/components/history/HistoryView'));
const RadioView = lazy(() => import('@/components/radio/RadioView'));
const MixesView = lazy(() => import('@/components/mixes/MixesView'));
const PlaylistImportView = lazy(() => import('@/components/playlist-import/PlaylistImportView'));
const SmartPlaylistsView = lazy(() => import('@/components/smart-playlists/SmartPlaylistsView'));
const NowPlayingView = lazy(() => import('@/components/now-playing/NowPlayingView'));
const DownloadsView = lazy(() => import('@/components/downloads/DownloadsView'));
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
const EditTagsDialogManager = lazy(() => import('@/components/shared/EditTagsDialogManager'));
const OnboardingWizard = lazy(() => import('@/components/onboarding/OnboardingWizard'));
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useLibrarySync } from '@/hooks/useLibrarySync';
import { usePlayerPreferences } from '@/hooks/usePlayerPreferences';
import { usePlaybackResume } from '@/hooks/usePlaybackResume';
import { useUpdateNotifications } from '@/hooks/useUpdateNotifications';
import { useSystemNotices } from '@/hooks/useSystemNotices';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useDebugPanel } from '@/hooks/useDebugPanel';
import { DevProfiler } from '@/components/debug/DevProfiler';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { useViewStore } from '@/stores/useViewStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { useDownloadQueueStore } from '@/stores/useDownloadQueueStore';
import {
  useDownloadQueueImporter,
  reconstructBatchesFromSnapshot,
} from '@/hooks/useDownloadQueueImporter';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useSupportBannerStore } from '@/stores/useSupportBannerStore';
import { useTelemetryStore } from '@/stores/useTelemetryStore';
import { AmbientColorProvider } from '@/hooks/useAmbientColor';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { hydrateLanguageFromStore } from '@/lib/i18n';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDismissed = useCallback(() => setSplashDone(true), []);

  const onboardingCompleted = useOnboardingStore(s => s.hasCompletedOnboarding);
  const hydrateOnboarding = useOnboardingStore(s => s.hydrateOnboarding);
  const hydrateSupportBanner = useSupportBannerStore(s => s.hydrateSupportBanner);
  const hydrateTelemetry = useTelemetryStore(s => s.hydrate);
  // Under the e2e harness, treat onboarding as done so specs land on the app
  // shell instead of the first-run wizard (fresh userDataDir → never completed).
  const [onboardingDone, setOnboardingDone] = useState(onboardingCompleted || IS_E2E);
  // Mirror the durable store flag locally so the wizard appears/disappears in
  // step with it — covers both replay (true→false from Settings) and boot-time
  // hydration (false→true from the electron-store mirror).
  useEffect(() => {
    if (IS_E2E) return;
    setOnboardingDone(onboardingCompleted);
  }, [onboardingCompleted]);
  const handleOnboardingComplete = useCallback(() => setOnboardingDone(true), []);

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
  useSystemNotices();
  useKeyboardShortcuts();
  const debugOpen = useDebugPanel();

  useEffect(() => {
    hydrateLanguageFromStore();
  }, []);

  useEffect(() => {
    void hydrateOnboarding();
  }, [hydrateOnboarding]);

  useEffect(() => {
    void hydrateSupportBanner();
  }, [hydrateSupportBanner]);

  useEffect(() => {
    void hydrateTelemetry();
  }, [hydrateTelemetry]);

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

  // Hydrate + subscribe to the main-process download queue. The importer hook
  // (mounted below) is the single owner of library import for queued downloads.
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const applySnapshot = useDownloadQueueStore.getState().applySnapshot;
    window.electronAPI.downloader
      .getDownloadQueue()
      .then(snapshot => {
        // Reconstruct any in-flight playlist-import batches from the restored
        // queue BEFORE applying the snapshot, so the App-level importer sees each
        // batch the instant it sees its items (zustand setState is synchronous).
        reconstructBatchesFromSnapshot(snapshot.items);
        applySnapshot(snapshot);
      })
      .catch((err: unknown) => {
        // The persisted queue failed to load at boot. The next queue-state
        // broadcast will recover the snapshot, but log so it's diagnosable.
        logger.error('[downloads] initial queue hydration failed', err);
      });
    const cleanup = window.electronAPI.downloader.onQueueState(applySnapshot);
    return cleanup;
  }, []);

  useDownloadQueueImporter();

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.metadata.onEnrichProgress(progress => {
      updateEnrichProgress(progress);
    });
    return cleanup;
  }, [updateEnrichProgress]);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    // A large scan fires one progress event per parsed file (~50k for a big
    // library), and each event committed straight to the store re-renders
    // ScanProgressCard. Coalesce to ~10 commits/sec: keep only the latest
    // event between ticks, but ALWAYS flush the final event (fileIndex reaches
    // fileCount) immediately so the bar never sticks below 100%.
    const THROTTLE_MS = 100;
    let pending: { filePath: string; fileIndex: number; fileCount: number; ok: boolean } | null =
      null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (pending) {
        useLibraryStore.getState().updateScanProgress(pending);
        pending = null;
      }
    };

    const cleanup = window.electronAPI.library.onScanProgress(p => {
      const isFinal = p.fileCount > 0 && p.fileIndex >= p.fileCount;
      if (isFinal) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        pending = null;
        useLibraryStore.getState().updateScanProgress(p);
        return;
      }
      pending = p;
      if (!timer) timer = setTimeout(flush, THROTTLE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      // Flush any straggler so the store reflects the last event the scan sent.
      if (pending) useLibraryStore.getState().updateScanProgress(pending);
      pending = null;
      cleanup();
    };
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

      {splashDone && !onboardingDone && (
        <ErrorBoundary viewName="OnboardingWizard">
          <Suspense fallback={null}>
            <OnboardingWizard onComplete={handleOnboardingComplete} />
          </Suspense>
        </ErrorBoundary>
      )}

      {splashDone && onboardingDone && (
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
            <ErrorBoundary viewName="CommandPalette">
              <CommandPalette />
            </ErrorBoundary>
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
            <ErrorBoundary viewName="EditTagsDialogManager">
              <Suspense fallback={null}>
                <EditTagsDialogManager />
              </Suspense>
            </ErrorBoundary>

            {compactMode ? (
              <ErrorBoundary viewName="CompactPlayer" compact>
                <CompactPlayer />
              </ErrorBoundary>
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
                <ErrorBoundary viewName="Sidebar" compact>
                  <Sidebar />
                </ErrorBoundary>

                {/* Main content area */}
                <div className="flex-1 flex flex-col min-w-0 relative">
                  {/* Support launch banner — shown once ever, after onboarding */}
                  <SupportBanner />

                  <ErrorBoundary viewName="TopBar" compact>
                    <TopBar
                      onAddFile={handleOpenFile}
                      onAddFolder={handleOpenFolder}
                      isScanning={isScanning}
                    />
                  </ErrorBoundary>

                  <main
                    id="main-content"
                    aria-label={t(activeView, { ns: 'sidebar', defaultValue: activeView })}
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
                      {activeView === 'overview' && (
                        <ErrorBoundary viewName="OverviewView">
                          <Suspense fallback={null}>
                            <DevProfiler id="overview">
                              <OverviewView />
                            </DevProfiler>
                          </Suspense>
                        </ErrorBoundary>
                      )}
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
                      {activeView === 'smart-playlists' && (
                        <ErrorBoundary viewName="SmartPlaylistsView">
                          <Suspense fallback={null}>
                            <SmartPlaylistsView />
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
                      {activeView === 'downloads' && (
                        <ErrorBoundary viewName="DownloadsView">
                          <Suspense fallback={null}>
                            <DownloadsView />
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
                    <ErrorBoundary viewName="PlayerBar" compact>
                      <DevProfiler id="player">
                        <PlayerBar />
                      </DevProfiler>
                    </ErrorBoundary>
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
