import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { Sidebar } from '@/components/shared/Sidebar';
import { TopBar } from '@/components/shared/TopBar';
import { SplashScreen } from '@/components/splash/SplashScreen';
import { PlayerBar } from '@/components/player';
import { CompactPlayer } from '@/components/player/CompactPlayer';
import { LibraryView } from '@/components/library/LibraryView';
import { FavoritesView } from '@/components/favorites/FavoritesView';
import { PlaylistsView } from '@/components/playlists/PlaylistsView';
import { AmbientBackground } from '@/components/shared/AmbientBackground';

const SettingsView = lazy(() => import('@/components/settings/SettingsView'));
const SearchView = lazy(() => import('@/components/search/SearchView'));
const RadioView = lazy(() => import('@/components/radio/RadioView'));
const PlaylistImportView = lazy(() => import('@/components/playlist-import/PlaylistImportView'));
const PlaylistDetailView = lazy(() => import('@/components/playlists/PlaylistDetailView'));
const LyricsPanel = lazy(() => import('@/components/lyrics/LyricsPanel'));
const QueuePanel = lazy(() => import('@/components/player/QueuePanel'));
const AudioVisualizer = lazy(() => import('@/components/player/AudioVisualizer'));
const WaveformVisualizer = lazy(() => import('@/components/player/WaveformVisualizer'));
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useLibraryActions } from '@/hooks/useLibraryActions';
import { useLibraryLoader } from '@/hooks/useLibraryLoader';
import { usePlayerPreferences } from '@/hooks/usePlayerPreferences';
import { usePlaybackResume } from '@/hooks/usePlaybackResume';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAppStore } from '@/stores/useAppStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { AmbientColorProvider } from '@/hooks/useAmbientColor';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDismissed = useCallback(() => setSplashDone(true), []);

  useAudioEngine();
  useMediaSession();
  usePlayerPreferences();
  useLibraryLoader();
  usePlaybackResume(splashDone);

  const { handleOpenFile, handleOpenFolder, isScanning } = useLibraryActions();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const activeView = useAppStore(s => s.activeView);
  const rightPanel = useAppStore(s => s.rightPanel);
  const selectedPlaylistId = useAppStore(s => s.selectedPlaylistId);
  const showVisualizer = useAppStore(s => s.showVisualizer);
  const visualizerStyle = useAppStore(s => s.visualizerStyle);
  const compactMode = useAppStore(s => s.compactMode);
  const updateDependencyInstall = useDownloadStore((s) => s.updateDependencyInstall);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const cleanup = window.electronAPI.downloader.onDependencyInstallProgress((progress) => {
      updateDependencyInstall(progress);
    });
    return cleanup;
  }, [updateDependencyInstall]);

  return (
    <>
      <SplashScreen ready={true} error={null} onDismissed={handleSplashDismissed} />

      {splashDone && (
        <AmbientColorProvider>
          <div
            className={cn(
              'h-screen w-screen bg-background text-foreground overflow-hidden relative',
              !compactMode && 'flex',
              IS_ELECTRON && 'rounded-t-[10px]'
            )}
          >
            <AmbientBackground />

            {compactMode ? (
              <CompactPlayer />
            ) : (
              <>
                {/* Sidebar */}
                <Sidebar />

                {/* Main content area */}
                <div className="flex-1 flex flex-col min-w-0 relative">
                  <TopBar
                    onAddFile={handleOpenFile}
                    onAddFolder={handleOpenFolder}
                    isScanning={isScanning}
                  />

                  <main className={cn(
                    'flex-1 flex overflow-hidden min-h-0',
                    currentTrack && showVisualizer ? 'pb-[136px]' : currentTrack ? 'pb-[88px]' : ''
                  )}>
                    {/* Center content */}
                    <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
                      {activeView === 'library' && <LibraryView />}
                      {activeView === 'playlists' && (
                        selectedPlaylistId ? (
                          <Suspense fallback={null}>
                            <PlaylistDetailView />
                          </Suspense>
                        ) : <PlaylistsView />
                      )}
                      {activeView === 'favorites' && <FavoritesView />}
                      {activeView === 'search' && (
                        <Suspense fallback={null}>
                          <SearchView />
                        </Suspense>
                      )}
                      {activeView === 'import-playlist' && (
                        <Suspense fallback={null}>
                          <PlaylistImportView />
                        </Suspense>
                      )}
                      {activeView === 'radio' && (
                        <Suspense fallback={null}>
                          <RadioView />
                        </Suspense>
                      )}
                      {activeView === 'settings' && (
                        <Suspense fallback={null}>
                          <SettingsView />
                        </Suspense>
                      )}
                    </div>

                    {/* Right panel */}
                    {currentTrack && rightPanel === 'lyrics' && (
                      <div className="w-[320px] border-l border-border/30 shrink-0 flex flex-col overflow-hidden bg-surface/30">
                        <Suspense fallback={null}>
                          <LyricsPanel />
                        </Suspense>
                      </div>
                    )}
                    {currentTrack && rightPanel === 'queue' && (
                      <div className="w-[320px] border-l border-border/30 shrink-0 flex flex-col overflow-hidden bg-surface/30">
                        <Suspense fallback={null}>
                          <QueuePanel />
                        </Suspense>
                      </div>
                    )}
                  </main>

                  {/* Visualizer strip above player bar */}
                  {currentTrack && showVisualizer && (
                    <div className="absolute bottom-[88px] left-0 right-0 z-40 h-[48px]">
                      <Suspense fallback={null}>
                        {visualizerStyle === 'waveform' ? <WaveformVisualizer /> : <AudioVisualizer />}
                      </Suspense>
                    </div>
                  )}

                  {/* Player bar */}
                  <PlayerBar />
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
